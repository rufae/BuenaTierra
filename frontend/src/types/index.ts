// ── Auth ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  usuarioId: number
  empresaId: number
  nombre: string
  apellidos: string
  email: string
  rol: 'Admin' | 'UsuarioObrador' | 'UsuarioRepartidor'
  token: string
}

// ── API wrapper ───────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean
  data: T
  message: string | null
  errors: string[]
  timestamp: string
}

// ── Empresa ───────────────────────────────────────────────────────────────────
export interface Empresa {
  id: number
  nombre: string
  nif: string
}

// ── Producto ──────────────────────────────────────────────────────────────────
export interface Producto {
  id: number
  empresaId: number
  codigo: string
  nombre: string
  descripcion: string | null
  precioVenta: number
  precioCoste: number | null
  ivaPorcentaje: number
  unidadMedida: string
  activo: boolean
  categoriaId: number | null
  categoriaNombre: string | null
}

export interface CreateProductoDto {
  empresaId: number
  codigo: string
  nombre: string
  descripcion?: string
  precioVenta: number
  precioCoste?: number
  ivaPorcentaje: number
  unidadMedida: string
  categoriaId?: number
}

// ── Cliente ───────────────────────────────────────────────────────────────────
export type TipoCliente = 'Empresa' | 'Autonomo' | 'Particular' | 'Repartidor'

export interface Cliente {
  id: number
  empresaId: number
  nombre: string
  nif: string | null
  tipo: TipoCliente
  email: string | null
  telefono: string | null
  direccion: string | null
  activo: boolean
}

export interface CreateClienteDto {
  empresaId: number
  nombre: string
  nif?: string
  tipo: TipoCliente
  email?: string
  telefono?: string
  direccion?: string
}

// ── Produccion / Lotes ────────────────────────────────────────────────────────
export type EstadoProduccion = 'Planificada' | 'EnCurso' | 'Finalizada' | 'Cancelada'

export interface Produccion {
  id: number
  empresaId: number
  productoId: number
  productoNombre: string
  fechaProduccion: string
  cantidadProducida: number
  unidadMedida: string
  estado: EstadoProduccion
  observaciones: string | null
}

export interface CreateProduccionDto {
  empresaId: number
  usuarioId: number
  productoId: number
  cantidadProducida: number
  observaciones?: string
}

export interface Lote {
  id: number
  codigoLote: string
  productoId: number
  productoNombre: string
  fechaLote: string
  fechaCaducidad: string | null
  cantidadInicial: number
  activo: boolean
  bloqueado: boolean
  motivoBloqueado: string | null
}

// ── Stock ─────────────────────────────────────────────────────────────────────
export interface StockItem {
  empresaId: number
  productoId: number
  productoNombre: string
  loteId: number
  codigoLote: string
  fechaLote: string
  fechaCaducidad: string | null
  cantidadDisponible: number
  cantidadReservada: number
}

// ── Series ────────────────────────────────────────────────────────────────────
export interface SerieFacturacion {
  id: number
  codigo: string
  prefijo: string | null
  descripcion: string | null
  activa: boolean
}

// ── Factura ───────────────────────────────────────────────────────────────────
export interface FacturaLinea {
  productoId: number
  productoNombre: string
  codigoLote: string
  cantidad: number
  precioUnitario: number
  descuento: number
  ivaPorcentaje: number
  subtotal: number
  ivaImporte: number
}

export interface Factura {
  id: number
  numeroFactura: string
  fechaFactura: string
  estado: string
  esSimplificada: boolean
  cliente: { id: number; nombre: string; nif: string | null }
  baseImponible: number
  ivaTotal: number
  total: number
  lineas: FacturaLinea[]
  pdfUrl: string | null
}

export interface CreateFacturaItemDto {
  productoId: number
  cantidad: number
}

export interface CreateFacturaDto {
  empresaId: number
  clienteId: number
  serieId: number
  esSimplificada?: boolean
  observaciones?: string
  items: CreateFacturaItemDto[]
}

export interface FifoPreviewItem {
  loteId: number
  codigoLote: string
  cantidad: number
  fechaLote: string
}

export interface FifoPreviewResult {
  productoId: number
  cantidadSolicitada: number
  asignaciones: FifoPreviewItem[]
  stockSuficiente: boolean
}

// ── Albaranes ─────────────────────────────────────────────────────────────────
export interface AlbaranResumen {
  id: number
  numeroAlbaran: string
  fecha: string
  estado: string
  clienteNombre: string
  clienteNif: string | null
  total: number
  pedidoId: number | null
}

export interface AlbaranLinea {
  productoId: number
  productoNombre: string
  codigoLote: string | null
  fechaFabricacion: string | null
  fechaCaducidad: string | null
  cantidad: number
  precioUnitario: number
  descuento: number
  ivaPorcentaje: number
  subtotal: number
  ivaImporte: number
}

export interface AlbaranDetalle {
  id: number
  numeroAlbaran: string
  fecha: string
  estado: string
  cliente: { id: number; nombre: string; nif: string | null }
  subtotal: number
  ivaTotal: number
  total: number
  pedidoId: number | null
  notas: string | null
  lineas: AlbaranLinea[]
}

export interface CreateAlbaranItemDto {
  productoId: number
  cantidad: number
  precioUnitario?: number
  descuento?: number
}

export interface CreateAlbaranDto {
  clienteId: number
  pedidoId?: number
  serieId?: number
  fechaAlbaran?: string
  notas?: string
  items: CreateAlbaranItemDto[]
}

// ── Pedidos ───────────────────────────────────────────────────────────────────
export interface PedidoResumen {
  id: number
  numeroPedido: string
  fecha: string
  fechaEntrega: string | null
  estado: string
  clienteNombre: string
  total: number
}

export interface PedidoLinea {
  productoId: number
  productoNombre: string
  cantidad: number
  precioUnitario: number
  descuento: number
  ivaPorcentaje: number
  subtotal: number
  ivaImporte: number
}

export interface PedidoDetalle {
  id: number
  numeroPedido: string
  fecha: string
  fechaEntrega: string | null
  estado: string
  cliente: { id: number; nombre: string; nif: string | null }
  subtotal: number
  ivaTotal: number
  total: number
  notas: string | null
  lineas: PedidoLinea[]
}

export interface CreatePedidoItemDto {
  productoId: number
  cantidad: number
  precioUnitario?: number
  descuento?: number
}

export interface CreatePedidoDto {
  clienteId: number
  fechaPedido?: string
  fechaEntrega?: string
  notas?: string
  items: CreatePedidoItemDto[]
}

// ── Trazabilidad ──────────────────────────────────────────────────────────────
export interface TrazabilidadItem {
  id: number
  fecha: string
  tipoOperacion: string
  productoNombre: string
  lote: string
  fechaFabricacion: string | null
  fechaCaducidad: string | null
  cantidad: number
  estadoLote: string | null
  clienteNombre: string | null
  clienteNif: string | null
  facturaNumero: string | null
  facturaFecha: string | null
  datosAdicionales?: string
}

// ── Ingredientes y Alérgenos ──────────────────────────────────────────────────
export interface Alergeno {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
}

export interface AlergenoRef {
  alergenoId: number
  codigo: string
  nombre: string
}

export interface Ingrediente {
  id: number
  nombre: string
  descripcion: string | null
  proveedor: string | null
  codigoProveedor: string | null
  activo: boolean
  alergenos: AlergenoRef[]
}

export interface ProductoIngredienteLinea {
  id: number
  productoId: number
  ingredienteId: number
  ingredienteNombre: string
  cantidadGr: number | null
  esPrincipal: boolean
  alergenos: AlergenoRef[]
}

export interface FichaAlergenoItem {
  id: number
  codigo: string
  nombre: string
  presente: boolean
}

export interface FichaAlergenos {
  producto: { id: number; nombre: string; codigo: string | null } | null
  ficha: FichaAlergenoItem[]
  totalAlergenos: number
}

export interface ProductoIngredientesData {
  ingredientes: ProductoIngredienteLinea[]
  alergenosProducto: AlergenoRef[]
}

// ── Trazabilidad directa ──────────────────────────────────────────────────────

export interface TrazaMovimiento {
  id: number
  fecha: string
  tipoOperacion: string
  cantidad: number
  clienteNombre: string | null
  clienteNif: string | null
  facturaNumero: string | null
}

export interface TrazaLote {
  id: number
  codigoLote: string
  fechaFabricacion: string
  fechaCaducidad: string | null
  cantidadInicial: number
  stockActual: number
  estado: string
  movimientos: TrazaMovimiento[]
}

export interface TrazaProducto {
  producto: { id: number; nombre: string; codigo: string | null }
  totalLotes: number
  lotes: TrazaLote[]
}

export interface TrazaIngredienteLote {
  codigoLote: string
  fechaFabricacion: string
  fechaCaducidad: string | null
  cantidadInicial: number
  stockActual: number
  estado: string
}

export interface TrazaIngredienteProducto {
  id: number
  nombre: string
  codigo: string | null
  cantidadGr: number | null
  esPrincipal: boolean
  totalLotes: number
  lotes: TrazaIngredienteLote[]
}

export interface TrazaClienteAfectado {
  clienteId: number | null
  nombre: string
  nif: string | null
  totalUnidades: number
  primeraVenta: string
  ultimaVenta: string
}

export interface TrazaIngrediente {
  ingrediente: {
    id: number
    nombre: string
    proveedor: string | null
    alergenos: { codigo: string; nombre: string }[]
  }
  productos: TrazaIngredienteProducto[]
  clientesAfectados: TrazaClienteAfectado[]
  totalMovimientos: number
  totalClientesAfectados: number
}

// ── Usuarios ──────────────────────────────────────────────────────────────────

export interface Usuario {
  id: number
  empresaId: number
  nombre: string
  apellidos: string | null
  email: string
  telefono: string | null
  rol: string
  activo: boolean
  ultimoAcceso: string | null
  nombreCompleto: string
}
