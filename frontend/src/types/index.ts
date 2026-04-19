// ── Auth ──────────────────────────────────────────────────────────────────────
export interface AuthUser {
  usuarioId: number
  empresaId: number
  nombre: string
  apellidos: string
  email: string
  rol: 'Admin' | 'Obrador' | 'Repartidor'
  token: string
  refreshToken?: string
  expira?: string
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

// ── Categorias ────────────────────────────────────────────────────────────────────

export interface Categoria {
  id: number
  nombre: string
}

// ── Producto ──────────────────────────────────────────────────────────────────

export interface Producto {
  id: number
  empresaId: number
  codigo: string | null
  codigoBarras: string | null
  nombre: string
  descripcion: string | null
  precioVenta: number
  precioCoste: number | null
  ivaPorcentaje: number
  unidadMedida: string
  pesoUnitarioGr: number | null
  vidaUtilDias: number | null
  vidaUtilUnidad: 'Dias' | 'Meses'
  activo: boolean
  requiereLote: boolean
  compartidoRepartidores: boolean
  categoriaId: number | null
  categoriaNombre: string | null
  // Comercial
  proveedorHabitual: string | null
  referencia: string | null
  fabricante: string | null
  descuentoPorDefecto: number | null
  // Stock
  stockMinimo: number | null
  stockMaximo: number | null
  // Nutricional (por 100 g) – Reglamento UE 1169/2011
  valorEnergeticoKj: number | null
  valorEnergeticoKcal: number | null
  grasas: number | null
  grasasSaturadas: number | null
  hidratosCarbono: number | null
  azucares: number | null
  proteinas: number | null
  sal: number | null
  // Etiquetado
  ingredientesTexto: string | null
  trazas: string | null
  conservacion: string | null
}

export interface CreateProductoDto {
  empresaId: number
  codigo?: string
  codigoBarras?: string
  nombre: string
  descripcion?: string
  categoriaId?: number | null
  precioVenta: number
  precioCoste?: number
  ivaPorcentaje: number
  unidadMedida: string
  pesoUnitarioGr?: number
  vidaUtilDias?: number
  vidaUtilUnidad?: 'Dias' | 'Meses'
  proveedorHabitual?: string
  referencia?: string
  fabricante?: string
  descuentoPorDefecto?: number
  stockMinimo?: number
  stockMaximo?: number
  requiereLote?: boolean
  compartidoRepartidores?: boolean
  activo?: boolean
}

/// Ingrediente asignado a un producto en el formulario de edición
export interface ProductoIngredienteItem {
  id: number
  ingredienteId: number
  nombre: string
  cantidadGr: number | null
  esPrincipal: boolean
  esDirecto: boolean
  alergenos: { alergenoId: number; nombre: string; codigo: string }[]
}

// ── Cliente ───────────────────────────────────────────────────────────────────
export type TipoCliente = 'Empresa' | 'Autonomo' | 'Particular' | 'Repartidor'
export type FormaPago = 'Contado' | 'Transfer30' | 'Transfer60' | 'Transfer90' | 'Domiciliacion' | 'Cheque' | 'Efectivo' | 'Otro'
export type TipoImpuesto = 'IVA' | 'RecargoEquivalencia' | 'Exento' | 'IGIC'
export type EstadoCliente = 'Activo' | 'Inactivo' | 'Suspendido' | 'Bloqueado'
export type EstadoSincronizacion = 'Sincronizado' | 'Pendiente' | 'Error' | 'NoAplicable'
export type TipoCondicionEspecial = 'Precio' | 'Descuento' | 'PrecioEspecial'
export type TipoArticuloFamilia = 'Articulo' | 'Familia'

export interface ClienteCondicionEspecial {
  id: number
  clienteId: number
  articuloFamilia: TipoArticuloFamilia
  codigo: string
  descripcion: string | null
  tipo: TipoCondicionEspecial
  precio: number
  descuento: number
}

export interface Cliente {
  id: number
  empresaId: number
  // Identificación
  tipo: TipoCliente
  codigoClienteInterno: string | null
  nombre: string
  apellidos: string | null
  razonSocial: string | null
  nombreComercial: string | null
  nombreFiscal: string | null
  nif: string | null
  aliasCliente: string | null
  // Domicilio
  direccion: string | null
  codigoPostal: string | null
  ciudad: string | null
  provincia: string | null
  pais: string | null
  // Contacto
  telefono: string | null
  telefono2: string | null
  email: string | null
  personaContacto: string | null
  observacionesContacto: string | null
  // Datos Bancarios
  ccc: string | null
  iban: string | null
  banco: string | null
  bic: string | null
  // Comercial
  formaPago: FormaPago
  diasPago: number
  tipoImpuesto: TipoImpuesto
  aplicarImpuesto: boolean
  recargoEquivalencia: boolean
  noAplicarRetenciones: boolean
  porcentajeRetencion: number
  descuentoGeneral: number
  tarifaId: number | null
  // Otros Datos
  estadoCliente: EstadoCliente
  activo: boolean
  fechaAlta: string | null
  estadoSincronizacion: EstadoSincronizacion
  noRealizarFacturas: boolean
  notas: string | null
  // Vinculación
  repartidorEmpresaId: number | null
  condicionesEspeciales?: ClienteCondicionEspecial[]
}

export type CreateClienteDto = Omit<Cliente, 'id' | 'condicionesEspeciales'>
export type UpdateClienteDto = Omit<Cliente, 'id' | 'empresaId' | 'condicionesEspeciales'>

export interface UpsertCondicionEspecialDto {
  articuloFamilia: TipoArticuloFamilia
  codigo: string
  descripcion?: string
  tipo: TipoCondicionEspecial
  precio: number
  descuento: number
}

// ── Produccion / Lotes ────────────────────────────────────────────────────────
export type EstadoProduccion = 'Planificada' | 'EnProceso' | 'Finalizada' | 'Cancelada'

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
  fechaVencimiento: string | null
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
  noRealizarFacturas: boolean
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
  cliente: { id: number; nombre: string; nif: string | null; noRealizarFacturas: boolean }
  subtotal: number
  ivaTotal: number
  total: number
  pedidoId: number | null
  notas: string | null
  lineas: AlbaranLinea[]
  clienteNoRealizarFacturas: boolean
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
  noRealizarFacturas: boolean
}

export interface PedidoLinea {
  productoId: number
  productoNombre: string
  cantidad: number
  precioUnitario: number
  descuento: number
  ivaPorcentaje: number
  recargoEquivalenciaPorcentaje: number
  subtotal: number
  ivaImporte: number
  recargoEquivalenciaImporte: number
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
  recargoEquivalenciaTotal: number
  retencionTotal: number
  total: number
  notas: string | null
  lineas: PedidoLinea[]
  noRealizarFacturas: boolean
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

// ── Control de Materias Primas ────────────────────────────────────────────────
export interface ControlMateriaPrima {
  id: number
  empresaId: number
  fechaEntrada: string          // DateOnly → ISO string "YYYY-MM-DD"
  ingredienteId: number | null
  producto: string
  unidades: number
  fechaCaducidad: string | null
  proveedor: string | null
  lote: string | null
  fechaAperturaLote: string | null
  condicionesTransporte: boolean
  mercanciaAceptada: boolean
  responsable: string | null
  fechaFinExistencia: string | null
  observaciones: string | null
  createdAt: string
}

export interface UpsertControlMateriaPrimaDto {
  fechaEntrada: string
  producto: string
  unidades: number
  ingredienteId: number | null
  fechaCaducidad: string | null
  proveedor: string | null
  lote: string | null
  fechaAperturaLote: string | null
  condicionesTransporte: boolean
  mercanciaAceptada: boolean
  responsable: string | null
  fechaFinExistencia: string | null
  observaciones: string | null
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
  clienteId: number | null
}

// ── Etiquetas ─────────────────────────────────────────────────────────────────

export type TipoImpresora = 'A4' | 'TermicaDirecta' | 'TermicaTransferencia'
export type FormatoEtiqueta = 'Docx' | 'Odt' | 'Pdf' | 'Png' | 'Jpg'
export type EstadoImpresion = 'Pendiente' | 'Impreso' | 'Error'

export interface PlantillaEtiqueta {
  id: number
  nombre: string
  descripcion: string | null
  anchoMm: number
  altoMm: number
  tipoImpresora: TipoImpresora
  contenidoJson: string
  contenidoHtml: string | null
  esPlantillaBase: boolean
  createdAt: string
}

export interface EtiquetaImportada {
  id: number
  nombre: string
  formato: FormatoEtiqueta
  tamanoBytes: number
  rutaArchivo?: string
  createdAt: string
}

export interface TrabajoImpresion {
  id: number
  plantillaNombre: string
  productoNombre: string | null
  codigoLote: string | null
  copias: number
  estado: EstadoImpresion
  createdAt: string
}

export interface TipoIvaRe {
  id: number
  ivaPorcentaje: number
  recargoEquivalenciaPorcentaje: number
  descripcion: string | null
}

export interface CreatePlantillaDto {
  nombre: string
  descripcion?: string
  anchoMm: number
  altoMm: number
  tipoImpresora?: string
  contenidoJson?: string
  contenidoHtml?: string
}

export interface ImprimirEtiquetaDto {
  plantillaEtiquetaId: number
  productoId?: number
  loteId?: number
  copias: number
}

export interface EtiquetaPreview {
  plantilla: {
    id: number
    nombre: string
    anchoMm: number
    altoMm: number
    contenidoJson: string
    contenidoHtml: string | null
  }
  producto: {
    id: number
    nombre: string
    codigo: string | null
    codigoBarras: string | null
    precioVenta: number
    ivaPorcentaje: number
    pesoUnitarioGr: number | null
    unidadMedida: string
    vidaUtilDias: number | null
    ingredientesTexto: string | null
    trazas: string | null
    conservacion: string | null
    valorEnergeticoKj: number | null
    valorEnergeticoKcal: number | null
    grasas: number | null
    grasasSaturadas: number | null
    hidratosCarbono: number | null
    azucares: number | null
    proteinas: number | null
    sal: number | null
  } | null
  lote: {
    id: number
    codigoLote: string
    fechaFabricacion: string
    fechaCaducidad: string | null
  } | null
  empresa: {
    nombre: string | null
    cif: string | null
    direccion: string | null
    nrgs: string | null
  } | null
}
