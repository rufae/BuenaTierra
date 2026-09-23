import { useQuery } from '@tanstack/react-query'
import api from './api'
import type { Cliente, ClienteCondicionEspecial, Empresa, Producto } from '../types'

/**
 * Política de precios/comerciales compartida entre páginas del frontend.
 * REGLA: debe reflejar exactamente a ComercialPricingPolicy (backend) para que
 * los previews cuadren al céntimo con lo que finalmente guarda la API:
 *  - precio: manual > condición especial (precio>0) > producto_base
 *  - descuento: manual (si se envía) > condición > cliente_general > producto_defecto
 *  - desempate de condiciones: especificidad desc, updatedAt desc, id desc
 *  - RE: tabla tipos_iva_re de la empresa; si la tabla existe y no tiene el tipo → 0;
 *    si no hay tabla → tasas legales 21→5.2, 10→1.4, 4→0.5
 */

export interface PreviewPricing {
  precioUnitario: number
  descuento: number
  origenPrecio: string
  origenDescuento: string
}

export interface TipoIvaRePar {
  ivaPorcentaje: number
  recargoEquivalenciaPorcentaje: number
}

/** Redondeo monetario a 2 decimales (AwayFromZero para valores positivos), igual que Money.R2 en backend. */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? ''
}

function isGlobalCodigo(value?: string | null) {
  if (!value || !value.trim()) return true
  const normalized = value.trim().toUpperCase()
  return normalized === '*' || normalized === 'TODOS' || normalized === 'ALL'
}

function getSpecificity(codigo: string | null | undefined, producto: Producto) {
  if (isGlobalCodigo(codigo)) return 1

  const normalized = normalizeCode(codigo)
  const keys = [producto.codigo, producto.referencia, String(producto.id)].map(normalizeCode)
  return keys.includes(normalized) ? 2 : 0
}

function findBestCondicion(
  condiciones: ClienteCondicionEspecial[] | undefined,
  producto: Producto,
  type: 'Precio' | 'Descuento'
): ClienteCondicionEspecial | null {
  if (!condiciones?.length) return null

  const filtered = condiciones
    .filter(c => c.articuloFamilia !== 'Familia')
    .filter(c => type === 'Precio'
      ? (c.tipo === 'Precio' || c.tipo === 'PrecioEspecial')
      : c.tipo === 'Descuento')
    .map(c => ({ condicion: c, specificity: getSpecificity(c.codigo, producto) }))
    .filter(x => x.specificity > 0)
    .sort((a, b) => {
      if (b.specificity !== a.specificity) return b.specificity - a.specificity
      // Mismo desempate que el backend: OrderByDescending(UpdatedAt).ThenByDescending(Id)
      const ua = Date.parse(a.condicion.updatedAt ?? '') || 0
      const ub = Date.parse(b.condicion.updatedAt ?? '') || 0
      if (ub !== ua) return ub - ua
      return b.condicion.id - a.condicion.id
    })

  return filtered[0]?.condicion ?? null
}

export function resolvePreviewPricing(
  cliente: Cliente | null,
  producto: Producto,
  condiciones: ClienteCondicionEspecial[] | undefined
): PreviewPricing {
  const condicionPrecio = findBestCondicion(condiciones, producto, 'Precio')
  const condicionDescuento = findBestCondicion(condiciones, producto, 'Descuento')

  const precioUnitario = condicionPrecio && condicionPrecio.precio > 0
    ? condicionPrecio.precio
    : producto.precioVenta

  const origenPrecio = condicionPrecio && condicionPrecio.precio > 0
    ? 'Condición especial'
    : 'Precio base'

  let descuento = 0
  let origenDescuento = 'Sin descuento'

  if (condicionDescuento && condicionDescuento.descuento > 0) {
    descuento = condicionDescuento.descuento
    origenDescuento = 'Condición especial'
  } else if ((cliente?.descuentoGeneral ?? 0) > 0) {
    descuento = cliente?.descuentoGeneral ?? 0
    origenDescuento = 'Cliente'
  } else if ((producto.descuentoPorDefecto ?? 0) > 0) {
    descuento = producto.descuentoPorDefecto ?? 0
    origenDescuento = 'Producto'
  }

  return { precioUnitario, descuento, origenPrecio, origenDescuento }
}

export function getIvaPorcentaje(cliente: Cliente | null, producto: Producto): number {
  if (!cliente) return producto.ivaPorcentaje ?? 0

  switch (cliente.tipoImpuesto) {
    case 'Exento':
      return 0
    case 'IGIC':
      return 7
    default:
      return cliente.aplicarImpuesto ? (producto.ivaPorcentaje ?? 0) : 0
  }
}

export function getRecargoEquivalenciaPorcentaje(
  cliente: Cliente | null,
  ivaPorcentaje: number,
  tabla?: TipoIvaRePar[] | null
): number {
  const aplicaRE = cliente?.tipoImpuesto === 'RecargoEquivalencia' || cliente?.recargoEquivalencia
  if (!aplicaRE) return 0

  // Misma regla que el backend: si la empresa tiene tabla RE configurada, solo esa tabla.
  if (tabla && tabla.length > 0) {
    const found = tabla.find(t => Number(t.ivaPorcentaje) === ivaPorcentaje)
    return found ? Number(found.recargoEquivalenciaPorcentaje) : 0
  }

  switch (ivaPorcentaje) {
    case 21: return 5.2
    case 10: return 1.4
    case 4: return 0.5
    default: return 0
  }
}

/**
 * Tabla RE (tipos_iva_re) de la empresa desde GET /api/empresa.
 * Compartida por Pedidos/Facturación/POS para previsualizar exactamente lo que calculará el backend.
 */
export function useEmpresaPrecios() {
  return useQuery({
    queryKey: ['empresa-precios'],
    queryFn: async () => (await api.get<{ data: Empresa }>('/empresa')).data.data,
    staleTime: 300_000,
    retry: 1,
  })
}
