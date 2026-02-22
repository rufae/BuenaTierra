# SISTEMA DE AUTOMATIZACIÓN DE LOTES - BUENATIERRA

## 1. PROBLEMA QUE RESUELVE

### 1.1. Situación Actual (Manual)

**Escenario real:**
```
Repartidor necesita facturar 10 cajas de palmeras

Stock disponible:
- Lote 20022026: 3 cajas
- Lote 21022026: 4 cajas
- Lote 22022026: 3 cajas

Proceso actual:
1. Buscar producto "Palmeras"
2. Ver qué lotes tiene disponibles
3. Añadir línea 1: 3 cajas - Lote 20022026
4. Añadir línea 2: 4 cajas - Lote 21022026
5. Añadir línea 3: 3 cajas - Lote 22022026

Problemas:
- 5 pasos manuales por producto
- 30-60 segundos por producto
- Errores humanos (lote equivocado, cantidad mal)
- Frustración operativa
- Facturas con 10-15 productos = 5-10 minutos solo en lotes
```

### 1.2. Solución Automatizada

**Proceso nuevo:**
```
1. Seleccionar producto "Palmeras"
2. Introducir cantidad: 10
3. [Sistema automático asigna lotes en background]
4. Vista previa muestra 3 líneas ya creadas con lotes
5. Confirmar y generar

Resultado:
- 2 pasos manuales
- 5-10 segundos por producto
- Cero errores
- Trazabilidad automática
- Factura completa en < 1 minuto
```

---

## 2. ARQUITECTURA DEL SISTEMA DE LOTES

### 2.1. Componentes

```
┌───────────────────────────────────────────────────────────────┐
│                     CAPA DE PRESENTACIÓN                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  UI: Crear Factura                                      │ │
│  │  Input: Producto + Cantidad (SIN LOTE)                  │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │ Request
                         ▼
┌───────────────────────────────────────────────────────────────┐
│                    CAPA DE APLICACIÓN                         │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  FacturacionService.CrearFactura()                      │ │
│  │    1. Validar datos                                     │ │
│  │    2. Llamar a LoteAsignacionService                    │ │
│  │    3. Crear líneas de factura (N por cada lote)         │ │
│  │    4. Actualizar stock                                  │ │
│  │    5. Registrar trazabilidad                            │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │ Business Logic
                         ▼
┌───────────────────────────────────────────────────────────────┐
│                      CAPA DE DOMINIO                          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  LoteAsignacionService (CORE)                           │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  AsignarLotesAutomatico()                          │ │ │
│  │  │   - Algoritmo FIFO                                 │ │ │
│  │  │   - Validación stock                               │ │ │
│  │  │   - Validación caducidad                           │ │ │
│  │  │   - Split automático                               │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │  EstadegiaSeleccionLotes (Strategy Pattern)       │ │ │
│  │  │   - FIFO (implementación por defecto)             │ │ │
│  │  │   - FEFO (futuro: First Expired First Out)        │ │ │
│  │  │   - Manual (futuro: selección manual si se desea) │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │ Data Access
                         ▼
┌───────────────────────────────────────────────────────────────┐
│                  CAPA DE INFRAESTRUCTURA                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  LoteRepository                                         │ │
│  │    - ObtenerDisponibles(empresaId, productoId)          │ │
│  │    - ActualizarCantidadDisponible(loteId, cantidad)     │ │
│  │  StockRepository                                        │ │
│  │    - ObtenerPorLote(empresaId, productoId, loteId)      │ │
│  │    - ActualizarStock(...)                               │ │
│  │  MovimientoStockRepository                              │ │
│  │    - RegistrarMovimiento(...)                           │ │
│  │  TrazabilidadRepository                                 │ │
│  │    - RegistrarTrazabilidad(...)                         │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │ SQL
                         ▼
┌───────────────────────────────────────────────────────────────┐
│                      BASE DE DATOS                            │
│  - Tabla: lotes                                               │
│  - Tabla: stock                                               │
│  - Tabla: movimientos_stock                                   │
│  - Tabla: trazabilidad                                        │
│  - Stored Procedure: asignar_lotes_automatico()               │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. ALGORITMO FIFO DETALLADO

### 3.1. Pseudocódigo

```
FUNCIÓN AsignarLotesAutomatico(empresaId, productoId, cantidadSolicitada):
    
    // 1. OBTENER LOTES DISPONIBLES
    lotes = CONSULTAR_DB(
        WHERE empresa_id = empresaId
          AND producto_id = productoId
          AND activo = TRUE
          AND bloqueado = FALSE
          AND cantidad_disponible > 0
          AND fecha_caducidad > HOY
        ORDER BY fecha_fabricacion ASC, id ASC
    )
    
    SI lotes.vacio():
        LANZAR_EXCEPCION("No hay lotes disponibles para el producto")
    
    // 2. ALGORITMO DE ASIGNACIÓN
    lineasAsignadas = []
    cantidadRestante = cantidadSolicitada
    
    PARA CADA lote EN lotes:
        SI cantidadRestante <= 0:
            SALIR_BUCLE
        
        // Validaciones
        SI lote.cantidad_disponible <= 0:
            CONTINUAR
        
        SI lote.fecha_caducidad < HOY:
            CONTINUAR
        
        SI lote.bloqueado:
            CONTINUAR
        
        // Calcular cantidad a asignar de este lote
        cantidadAsignar = MIN(lote.cantidad_disponible, cantidadRestante)
        
        // Crear asignación
        lineasAsignadas.agregar({
            loteId: lote.id,
            loteCodigo: lote.codigo,
            cantidad: cantidadAsignar,
            fechaCaducidad: lote.fecha_caducidad,
            precioUnitario: producto.precio_venta
        })
        
        // Reducir cantidad restante
        cantidadRestante = cantidadRestante - cantidadAsignar
    FIN PARA
    
    // 3. VALIDACIÓN FINAL
    SI cantidadRestante > 0:
        LANZAR_EXCEPCION(
            "Stock insuficiente",
            {
                solicitado: cantidadSolicitada,
                disponible: cantidadSolicitada - cantidadRestante,
                faltante: cantidadRestante
            }
        )
    
    // 4. RETORNAR LÍNEAS ASIGNADAS
    RETORNAR lineasAsignadas
FIN FUNCIÓN
```

### 3.2. Implementación C# (Domain Service)

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using BuenaTierra.Domain.Entities;
using BuenaTierra.Domain.Interfaces;
using BuenaTierra.Domain.Exceptions;

namespace BuenaTierra.Domain.Services
{
    public class LoteAsignacionService
    {
        private readonly ILoteRepository _loteRepository;
        private readonly IStockRepository _stockRepository;
        private readonly ILogger<LoteAsignacionService> _logger;

        public LoteAsignacionService(
            ILoteRepository loteRepository,
            IStockRepository stockRepository,
            ILogger<LoteAsignacionService> logger)
        {
            _loteRepository = loteRepository ?? throw new ArgumentNullException(nameof(loteRepository));
            _stockRepository = stockRepository ?? throw new ArgumentNullException(nameof(stockRepository));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Asigna lotes automáticamente usando estrategia FIFO
        /// </summary>
        public async Task<List<LoteAsignado>> AsignarLotesAutomaticoAsync(
            int empresaId,
            int productoId,
            decimal cantidadSolicitada,
            DateTime? fechaLimiteConsulta = null)
        {
            _logger.LogInformation(
                "Iniciando asignación automática de lotes. Empresa: {EmpresaId}, Producto: {ProductoId}, Cantidad: {Cantidad}",
                empresaId, productoId, cantidadSolicitada);

            // Validaciones previas
            if (cantidadSolicitada <= 0)
            {
                throw new ArgumentException("La cantidad solicitada debe ser mayor a cero", nameof(cantidadSolicitada));
            }

            // 1. Obtener lotes disponibles ordenados por FIFO
            var lotesDisponibles = await _loteRepository.ObtenerDisponiblesParaVentaAsync(
                empresaId,
                productoId,
                fechaLimiteConsulta
            );

            if (!lotesDisponibles.Any())
            {
                _logger.LogWarning(
                    "No hay lotes disponibles. Empresa: {EmpresaId}, Producto: {ProductoId}",
                    empresaId, productoId);

                throw new NoHayLotesDisponiblesException(
                    $"No hay lotes disponibles para el producto ID {productoId}");
            }

            // 2. Ejecutar algoritmo de asignación
            var lineasAsignadas = new List<LoteAsignado>();
            decimal cantidadRestante = cantidadSolicitada;

            foreach (var lote in lotesDisponibles)
            {
                if (cantidadRestante <= 0)
                {
                    break; // Ya asignamos toda la cantidad solicitada
                }

                // Obtener stock actual del lote
                var stock = await _stockRepository.ObtenerPorLoteAsync(empresaId, productoId, lote.Id);

                if (stock == null || stock.CantidadDisponible <= 0)
                {
                    _logger.LogDebug("Lote {LoteId} sin stock disponible, saltando", lote.Id);
                    continue;
                }

                // Validar fecha caducidad
                if (lote.FechaCaducidad < DateTime.Today)
                {
                    _logger.LogWarning("Lote {LoteCodigo} caducado, saltando", lote.Codigo);
                    continue;
                }

                // Validar que no esté bloqueado
                if (lote.Bloqueado)
                {
                    _logger.LogDebug("Lote {LoteCodigo} bloqueado, saltando", lote.Codigo);
                    continue;
                }

                // Calcular cantidad a asignar de este lote
                var cantidadAsignar = Math.Min(stock.CantidadDisponible, cantidadRestante);

                // Crear asignación
                var asignacion = new LoteAsignado
                {
                    LoteId = lote.Id,
                    LoteCodigo = lote.Codigo,
                    ProductoId = productoId,
                    Cantidad = cantidadAsignar,
                    FechaFabricacion = lote.FechaFabricacion,
                    FechaCaducidad = lote.FechaCaducidad,
                    StockAnterior = stock.CantidadDisponible
                };

                lineasAsignadas.Add(asignacion);

                _logger.LogDebug(
                    "Lote asignado: {LoteCodigo}, Cantidad: {Cantidad}",
                    lote.Codigo, cantidadAsignar);

                cantidadRestante -= cantidadAsignar;
            }

            // 3. Validación final: verificar que se asignó toda la cantidad
            if (cantidadRestante > 0)
            {
                var cantidadDisponible = cantidadSolicitada - cantidadRestante;

                _logger.LogError(
                    "Stock insuficiente. Solicitado: {Solicitado}, Disponible: {Disponible}, Faltante: {Faltante}",
                    cantidadSolicitada, cantidadDisponible, cantidadRestante);

                throw new StockInsuficienteException(
                    $"Stock insuficiente para completar la operación",
                    new StockInsuficienteDetails
                    {
                        ProductoId = productoId,
                        CantidadSolicitada = cantidadSolicitada,
                        CantidadDisponible = cantidadDisponible,
                        CantidadFaltante = cantidadRestante
                    });
            }

            _logger.LogInformation(
                "Asignación completada exitosamente. Total líneas: {TotalLineas}",
                lineasAsignadas.Count);

            return lineasAsignadas;
        }

        /// <summary>
        /// Reservar stock temporalmente (para pedidos sin confirmar)
        /// </summary>
        public async Task ReservarStockAsync(List<LoteAsignado> lotes, int usuarioId)
        {
            foreach (var lote in lotes)
            {
                await _stockRepository.ReservarCantidadAsync(
                    lote.LoteId,
                    lote.Cantidad,
                    usuarioId);

                _logger.LogDebug(
                    "Stock reservado. Lote: {LoteId}, Cantidad: {Cantidad}",
                    lote.LoteId, lote.Cantidad);
            }
        }

        /// <summary>
        /// Liberar reservas de stock
        /// </summary>
        public async Task LiberarReservasAsync(List<LoteAsignado> lotes, int usuarioId)
        {
            foreach (var lote in lotes)
            {
                await _stockRepository.LiberarReservaAsync(
                    lote.LoteId,
                    lote.Cantidad,
                    usuarioId);

                _logger.LogDebug(
                    "Reserva liberada. Lote: {LoteId}, Cantidad: {Cantidad}",
                    lote.LoteId, lote.Cantidad);
            }
        }

        /// <summary>
        /// Confirmar venta y descontar stock definitivamente
        /// </summary>
        public async Task ConfirmarVentaYDescontarStockAsync(
            List<LoteAsignado> lotes,
            int empresaId,
            string documentoTipo,
            int documentoId,
            int usuarioId)
        {
            foreach (var lote in lotes)
            {
                // Descontar de stock
                await _stockRepository.DescontarStockAsync(
                    empresaId,
                    lote.ProductoId,
                    lote.LoteId,
                    lote.Cantidad,
                    usuarioId);

                // Actualizar cantidad disponible en lote
                await _loteRepository.ActualizarCantidadDisponibleAsync(
                    lote.LoteId,
                    -lote.Cantidad);

                // Registrar movimiento de stock
                await _stockRepository.RegistrarMovimientoAsync(new MovimientoStock
                {
                    EmpresaId = empresaId,
                    ProductoId = lote.ProductoId,
                    LoteId = lote.LoteId,
                    TipoMovimiento = TipoMovimientoStock.SalidaVenta,
                    Cantidad = lote.Cantidad,
                    DocumentoTipo = documentoTipo,
                    DocumentoId = documentoId,
                    UsuarioId = usuarioId
                });

                _logger.LogInformation(
                    "Stock descontado. Lote: {LoteId}, Cantidad: {Cantidad}, Documento: {DocTipo}-{DocId}",
                    lote.LoteId, lote.Cantidad, documentoTipo, documentoId);
            }
        }
    }

    // Modelo de resultado
    public class LoteAsignado
    {
        public int LoteId { get; set; }
        public string LoteCodigo { get; set; }
        public int ProductoId { get; set; }
        public decimal Cantidad { get; set; }
        public DateTime FechaFabricacion { get; set; }
        public DateTime FechaCaducidad { get; set; }
        public decimal StockAnterior { get; set; }
    }

    // Excepciones personalizadas
    public class NoHayLotesDisponiblesException : DomainException
    {
        public NoHayLotesDisponiblesException(string message) : base(message) { }
    }

    public class StockInsuficienteException : DomainException
    {
        public StockInsuficienteDetails Details { get; }

        public StockInsuficienteException(string message, StockInsuficienteDetails details)
            : base(message)
        {
            Details = details;
        }
    }

    public class StockInsuficienteDetails
    {
        public int ProductoId { get; set; }
        public decimal CantidadSolicitada { get; set; }
        public decimal CantidadDisponible { get; set; }
        public decimal CantidadFaltante { get; set; }
    }
}
```

---

## 4. INTEGRACIÓN CON FACTURACIÓN

### 4.1. Flujo Completo: Crear Factura con Asignación Automática

```csharp
public class FacturacionService : IFacturacionService
{
    private readonly IFacturaRepository _facturaRepository;
    private readonly LoteAsignacionService _loteAsignacionService;
    private readonly IProductoRepository _productoRepository;
    private readonly IClienteRepository _clienteRepository;
    private readonly ITrazabilidadRepository _trazabilidadRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPdfService _pdfService;
    private readonly ILogger<FacturacionService> _logger;

    public async Task<FacturaDto> CrearFacturaAsync(CrearFacturaRequest request, int usuarioId)
    {
        _logger.LogInformation("Iniciando creación de factura para cliente {ClienteId}", request.ClienteId);

        // Validar cliente
        var cliente = await _clienteRepository.ObtenerPorIdAsync(request.ClienteId)
            ?? throw new EntityNotFoundException($"Cliente {request.ClienteId} no encontrado");

        // Obtener siguiente número de factura
        var numeroFactura = await _facturaRepository.ObtenerSiguienteNumeroAsync(
            request.EmpresaId,
            request.Serie);

        // Crear factura (encabezado)
        var factura = new Factura
        {
            EmpresaId = request.EmpresaId,
            ClienteId = request.ClienteId,
            NumeroFactura = numeroFactura,
            Serie = request.Serie,
            FechaFactura = request.FechaFactura ?? DateTime.Today,
            TipoFactura = TipoFactura.Simplificada,
            CreatedBy = usuarioId
        };

        var lineasFactura = new List<FacturaLinea>();
        int numeroLinea = 1;

        // Procesar cada producto solicitado
        foreach (var item in request.Items)
        {
            var producto = await _productoRepository.ObtenerPorIdAsync(item.ProductoId)
                ?? throw new EntityNotFoundException($"Producto {item.ProductoId} no encontrado");

            // ═══════════════════════════════════════════════════════
            // ASIGNACIÓN AUTOMÁTICA DE LOTES (CORE)
            // ═══════════════════════════════════════════════════════
            var lotesAsignados = await _loteAsignacionService.AsignarLotesAutomaticoAsync(
                request.EmpresaId,
                item.ProductoId,
                item.Cantidad);

            _logger.LogInformation(
                "Lotes asignados para producto {ProductoId}: {NumLineas} líneas",
                item.ProductoId, lotesAsignados.Count);

            // Crear UNA LÍNEA DE FACTURA POR CADA LOTE
            foreach (var loteAsignado in lotesAsignados)
            {
                var precioUnitario = item.PrecioUnitario ?? producto.PrecioVenta;
                var descuento = item.Descuento ?? cliente.DescuentoGeneral ?? 0;
                var baseImponible = loteAsignado.Cantidad * precioUnitario * (1 - descuento / 100);
                var totalIva = baseImponible * (producto.Iva / 100);
                var totalLinea = baseImponible + totalIva;

                var lineaFactura = new FacturaLinea
                {
                    ProductoId = item.ProductoId,
                    LoteId = loteAsignado.LoteId,  // ← CLAVE: cada línea tiene su lote
                    Linea = numeroLinea++,
                    Descripcion = $"{producto.Nombre} - Lote {loteAsignado.LoteCodigo} - Cad: {loteAsignado.FechaCaducidad:dd/MM/yyyy}",
                    Cantidad = loteAsignado.Cantidad,
                    Unidad = producto.UnidadMedida.ToString(),
                    PrecioUnitario = precioUnitario,
                    Descuento = descuento,
                    BaseImponible = baseImponible,
                    Iva = producto.Iva,
                    TotalLinea = totalLinea
                };

                lineasFactura.Add(lineaFactura);
            }
        }

        // Calcular totales
        factura.BaseImponible = lineasFactura.Sum(l => l.BaseImponible);
        factura.TotalIva = lineasFactura.Sum(l => l.TotalLinea - l.BaseImponible);
        factura.TotalFactura = lineasFactura.Sum(l => l.TotalLinea);

        // Iniciar transacción
        using (var transaction = await _unitOfWork.BeginTransactionAsync())
        {
            try
            {
                // Guardar factura
                await _facturaRepository.CrearAsync(factura);
                await _unitOfWork.SaveChangesAsync();

                // Asignar factura_id a las líneas y guardar
                foreach (var linea in lineasFactura)
                {
                    linea.FacturaId = factura.Id;
                    await _facturaRepository.CrearLineaAsync(linea);
                }

                // Descontar stock y registrar trazabilidad
                var lotesParaDescontar = lineasFactura
                    .Select(l => new LoteAsignado
                    {
                        LoteId = l.LoteId.Value,
                        ProductoId = l.ProductoId,
                        Cantidad = l.Cantidad
                    })
                    .ToList();

                await _loteAsignacionService.ConfirmarVentaYDescontarStockAsync(
                    lotesParaDescontar,
                    request.EmpresaId,
                    "FACTURA",
                    factura.Id,
                    usuarioId);

                // Registrar trazabilidad
                foreach (var linea in lineasFactura)
                {
                    await _trazabilidadRepository.RegistrarAsync(new Trazabilidad
                    {
                        ProductoId = linea.ProductoId,
                        LoteId = linea.LoteId.Value,
                        TipoOrigen = "VENTA",
                        OrigenId = factura.Id,
                        ClienteId = factura.ClienteId,
                        DocumentoTipo = "FACTURA",
                        DocumentoId = factura.Id,
                        Cantidad = linea.Cantidad,
                        Unidad = linea.Unidad,
                        FechaMovimiento = DateTime.Now
                    });
                }

                await _unitOfWork.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("Factura {NumeroFactura} creada exitosamente con {NumLineas} líneas",
                    factura.NumeroFactura, lineasFactura.Count);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error al crear factura");
                throw;
            }
        }

        // Generar PDF (asíncrono, no bloquear)
        _ = Task.Run(async () =>
        {
            try
            {
                var pdfPath = await _pdfService.GenerarFacturaPdfAsync(factura.Id);
                await _facturaRepository.ActualizarPdfPathAsync(factura.Id, pdfPath);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar PDF de factura {FacturaId}", factura.Id);
            }
        });

        // Retornar DTO
        return MapearFacturaADto(factura, lineasFactura);
    }
}
```

### 4.2. Request Model

```csharp
public class CrearFacturaRequest
{
    public int EmpresaId { get; set; }
    public int ClienteId { get; set; }
    public string Serie { get; set; } = "A";
    public DateTime? FechaFactura { get; set; }
    public List<ItemFacturaRequest> Items { get; set; } = new();
}

public class ItemFacturaRequest
{
    public int ProductoId { get; set; }
    public decimal Cantidad { get; set; }
    public decimal? PrecioUnitario { get; set; }  // Opcional, usa el del producto si null
    public decimal? Descuento { get; set; }        // Opcional, usa el del cliente si null
}
```

### 4.3. Ejemplo de Request JSON

```json
{
  "empresaId": 1,
  "clienteId": 45,
  "serie": "A",
  "fechaFactura": "2026-02-20",
  "items": [
    {
      "productoId": 123,
      "cantidad": 10
    },
    {
      "productoId": 456,
      "cantidad": 5
    }
  ]
}
```

### 4.4. Ejemplo de Response JSON

```json
{
  "success": true,
  "data": {
    "id": 1523,
    "numeroFactura": "A/2026/001523",
    "fechaFactura": "2026-02-20",
    "cliente": {
      "id": 45,
      "nombre": "Repartidor Juan Pérez"
    },
    "lineas": [
      {
        "linea": 1,
        "productoId": 123,
        "descripcion": "Palmeras - Lote 20022026 - Cad: 27/02/2026",
        "loteId": 891,
        "loteCodigo": "20022026",
        "cantidad": 3,
        "precioUnitario": 12.50,
        "totalLinea": 37.50
      },
      {
        "linea": 2,
        "productoId": 123,
        "descripcion": "Palmeras - Lote 21022026 - Cad: 28/02/2026",
        "loteId": 892,
        "loteCodigo": "21022026",
        "cantidad": 4,
        "precioUnitario": 12.50,
        "totalLinea": 50.00
      },
      {
        "linea": 3,
        "productoId": 123,
        "descripcion": "Palmeras - Lote 22022026 - Cad: 01/03/2026",
        "loteId": 893,
        "loteCodigo": "22022026",
        "cantidad": 3,
        "precioUnitario": 12.50,
        "totalLinea": 37.50
      }
    ],
    "baseImponible": 125.00,
    "totalIva": 12.50,
    "totalFactura": 137.50
  }
}
```

**Nota:** El usuario pidió 10 unidades de producto 123, el sistema automáticamente lo dividió en 3 líneas con sus respectivos lotes.

---

## 5. CASOS DE USO Y ESCENARIOS

### 5.1. Caso 1: Stock Suficiente en 1 Lote

**Contexto:**
```
Pedido: 5 cajas de producto X
Stock:
  - Lote A: 10 cajas disponibles
```

**Resultado:**
```
1 línea de factura:
  - 5 cajas - Lote A
```

### 5.2. Caso 2: Stock Dividido en Múltiples Lotes

**Contexto:**
```
Pedido: 15 cajas de producto Y
Stock:
  - Lote A (fab: 18/02): 6 cajas
  - Lote B (fab: 19/02): 5 cajas
  - Lote C (fab: 20/02): 8 cajas
```

**Resultado:**
```
3 líneas de factura:
  - 6 cajas - Lote A (FIFO: más antiguo primero)
  - 5 cajas - Lote B
  - 4 cajas - Lote C
```

### 5.3. Caso 3: Stock Insuficiente

**Contexto:**
```
Pedido: 20 cajas de producto Z
Stock:
  - Lote A: 8 cajas
  - Lote B: 5 cajas
Total disponible: 13 cajas
```

**Resultado:**
```
EXCEPCIÓN: StockInsuficienteException
{
  "error": "Stock insuficiente",
  "productoId": 789,
  "solicitado": 20,
  "disponible": 13,
  "faltante": 7
}
```

**Acción UI:**
- Mostrar alerta al usuario
- Ofrecer opciones:
  - Reducir cantidad a 13
  - Cancelar
  - Crear pedido pendiente

### 5.4. Caso 4: Lotes Caducados

**Contexto:**
```
Pedido: 10 cajas de producto W
Stock:
  - Lote A (cad: 15/02/2026): 4 cajas [CADUCADO]
  - Lote B (cad: 25/02/2026): 6 cajas [VÁLIDO]
  - Lote C (cad: 28/02/2026): 5 cajas [VÁLIDO]
Hoy: 20/02/2026
```

**Resultado:**
```
Sistema automáticamente ignora Lote A
2 líneas de factura:
  - 6 cajas - Lote B
  - 4 cajas - Lote C
```

### 5.5. Caso 5: Lotes Bloqueados (Incidencia Calidad)

**Contexto:**
```
Pedido: 8 cajas de producto V
Stock:
  - Lote A: 5 cajas [bloqueado = true] → Incidencia calidad
  - Lote B: 10 cajas [bloqueado = false]
```

**Resultado:**
```
Sistema ignora Lote A
1 línea de factura:
  - 8 cajas - Lote B
```

---

## 6. OPTIMIZACIONES Y PERFORMANCE

### 6.1. Índices Críticos (Ya definidos en DB)

```sql
-- Consulta principal de lotes disponibles
CREATE INDEX idx_lotes_producto_fecha_activo 
    ON lotes(producto_id, fecha_fabricacion, id) 
    WHERE activo = true AND bloqueado = false;

-- Stock disponible
CREATE INDEX idx_stock_disponible 
    ON stock(cantidad_disponible) 
    WHERE cantidad_disponible > 0;
```

### 6.2. Caché de Productos Activos

```csharp
// Memoria caché para productos consultados frecuentemente
private readonly IMemoryCache _cache;

public async Task<Producto> ObtenerProductoConCacheAsync(int productoId)
{
    var cacheKey = $"producto_{productoId}";
    
    if (!_cache.TryGetValue(cacheKey, out Producto producto))
    {
        producto = await _productoRepository.ObtenerPorIdAsync(productoId);
        
        var cacheOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(30))
            .SetSlidingExpiration(TimeSpan.FromMinutes(10));
        
        _cache.Set(cacheKey, producto, cacheOptions);
    }
    
    return producto;
}
```

### 6.3. Consulta Optimizada con Stored Procedure (Alternativa)

Para máxima performance, el algoritmo FIFO puede ejecutarse directamente en PostgreSQL:

```sql
-- Ya definido en 01_DATABASE_DESIGN.md
SELECT asignar_lotes_automatico(empresa_id, producto_id, cantidad);
```

**Ventaja:** Ejecución en servidor DB, menos round-trips  
**Desventaja:** Lógica menos flexible, más difícil de testear

**Recomendación:** Usar servicio C# en MVP, evaluar stored procedure si performance es crítica.

---

## 7. TESTING

### 7.1. Tests Unitarios

```csharp
[TestClass]
public class LoteAsignacionServiceTests
{
    [TestMethod]
    public async Task AsignarLotes_StockSuficienteUnLote_DebeAsignarCorrectamente()
    {
        // Arrange
        var mockLoteRepo = new Mock<ILoteRepository>();
        var mockStockRepo = new Mock<IStockRepository>();
        
        mockLoteRepo.Setup(r => r.ObtenerDisponiblesParaVentaAsync(1, 100, null))
            .ReturnsAsync(new List<Lote>
            {
                new Lote { Id = 1, Codigo = "20022026", FechaFabricacion = DateTime.Today, FechaCaducidad = DateTime.Today.AddDays(7), Bloqueado = false }
            });
        
        mockStockRepo.Setup(r => r.ObtenerPorLoteAsync(1, 100, 1))
            .ReturnsAsync(new Stock { CantidadDisponible = 10 });
        
        var service = new LoteAsignacionService(mockLoteRepo.Object, mockStockRepo.Object, Mock.Of<ILogger<LoteAsignacionService>>());
        
        // Act
        var result = await service.AsignarLotesAutomaticoAsync(1, 100, 5);
        
        // Assert
        Assert.AreEqual(1, result.Count);
        Assert.AreEqual(5, result[0].Cantidad);
        Assert.AreEqual("20022026", result[0].LoteCodigo);
    }
    
    [TestMethod]
    [ExpectedException(typeof(StockInsuficienteException))]
    public async Task AsignarLotes_StockInsuficiente_DebeLanzarExcepcion()
    {
        // Arrange
        var mockLoteRepo = new Mock<ILoteRepository>();
        var mockStockRepo = new Mock<IStockRepository>();
        
        mockLoteRepo.Setup(r => r.ObtenerDisponiblesParaVentaAsync(1, 100, null))
            .ReturnsAsync(new List<Lote>
            {
                new Lote { Id = 1, Codigo = "20022026", FechaFabricacion = DateTime.Today, FechaCaducidad = DateTime.Today.AddDays(7), Bloqueado = false }
            });
        
        mockStockRepo.Setup(r => r.ObtenerPorLoteAsync(1, 100, 1))
            .ReturnsAsync(new Stock { CantidadDisponible = 3 });
        
        var service = new LoteAsignacionService(mockLoteRepo.Object, mockStockRepo.Object, Mock.Of<ILogger<LoteAsignacionService>>());
        
        // Act
        await service.AsignarLotesAutomaticoAsync(1, 100, 10); // Solicita 10, solo hay 3
        
        // Assert: Espera excepción
    }
}
```

### 7.2. Tests de Integración

```csharp
[TestClass]
public class FacturacionIntegrationTests : IntegrationTestBase
{
    [TestMethod]
    public async Task CrearFactura_ConAsignacionAutomaticaLotes_DebeCrearLineasCorrectamente()
    {
        // Arrange: Crear datos de prueba en DB
        var productoId = await CrearProductoPruebaAsync();
        var lote1Id = await CrearLotePruebaAsync(productoId, 5, "20022026");
        var lote2Id = await CrearLotePruebaAsync(productoId, 5, "21022026");
        var clienteId = await CrearClientePruebaAsync();
        
        var request = new CrearFacturaRequest
        {
            EmpresaId = 1,
            ClienteId = clienteId,
            Items = new List<ItemFacturaRequest>
            {
                new ItemFacturaRequest { ProductoId = productoId, Cantidad = 8 }
            }
        };
        
        // Act
        var service = GetService<IFacturacionService>();
        var resultado = await service.CrearFacturaAsync(request, 1);
        
        // Assert
        Assert.IsTrue(resultado.Success);
        Assert.AreEqual(2, resultado.Data.Lineas.Count); // Debe haber 2 líneas (5 + 3)
        Assert.AreEqual(5, resultado.Data.Lineas[0].Cantidad);
        Assert.AreEqual(3, resultado.Data.Lineas[1].Cantidad);
        
        // Verificar que stock se descontó
        var stock1 = await GetStockAsync(1, productoId, lote1Id);
        var stock2 = await GetStockAsync(1, productoId, lote2Id);
        Assert.AreEqual(0, stock1.CantidadDisponible); // 5 - 5 = 0
        Assert.AreEqual(2, stock2.CantidadDisponible); // 5 - 3 = 2
    }
}
```

---

## 8. MONITORIZACIÓN Y ALERTAS

### 8.1. Métricas a Monitorizar

```csharp
public class LoteAsignacionMetrics
{
    public static readonly Counter AsignacionesExitosas = Metrics.CreateCounter(
        "lote_asignaciones_exitosas_total",
        "Total de asignaciones de lotes exitosas");
    
    public static readonly Counter AsignacionesFallidas = Metrics.CreateCounter(
        "lote_asignaciones_fallidas_total",
        "Total de asignaciones de lotes fallidas");
    
    public static readonly Histogram TiempoAsignacion = Metrics.CreateHistogram(
        "lote_asignacion_duracion_segundos",
        "Duración de asignación de lotes en segundos");
    
    public static readonly Gauge StockBajo = Metrics.CreateGauge(
        "productos_stock_bajo_total",
        "Total de productos con stock por debajo del mínimo");
}
```

### 8.2. Logs Estructurados

```csharp
_logger.LogInformation(
    "Asignación lotes completada. ProductoId={ProductoId}, Cantidad={Cantidad}, NumLotes={NumLotes}, Duracion={Duracion}ms",
    productoId, cantidadSolicitada, lineasAsignadas.Count, stopwatch.ElapsedMilliseconds);
```

### 8.3. Alertas Automatizadas

- Stock insuficiente frecuente → Revisar producción
- Tiempo de asignación > 500ms → Optimizar índices
- Lotes próximos a caducar sin venderse → Promociones

---

## 9. EXTENSIBILIDAD FUTURA

### 9.1. Estrategias Alternativas de Asignación

```csharp
public interface IEstrategiaSeleccionLotes
{
    Task<List<LoteAsignado>> SeleccionarLotesAsync(
        int empresaId, 
        int productoId, 
        decimal cantidad);
}

// Implementaciones:
public class EstrategiaFIFO : IEstrategiaSeleccionLotes { ... }
public class EstrategiaFEFO : IEstrategiaSeleccionLotes { ... } // First Expired First Out
public class EstrategiaManual : IEstrategiaSeleccionLotes { ... }

// Configurar estrategia por empresa o producto
public class LoteAsignacionService
{
    private readonly IEstrategiaSeleccionLotes _estrategia;
    
    public LoteAsignacionService(IEstrategiaSeleccionLotes estrategia)
    {
        _estrategia = estrategia;
    }
}
```

### 9.2. Priorización de Lotes por Otros Criterios

- Lotes con menos cantidad (vaciar lotes antes)
- Lotes en ubicación específica (gestión de almacén)
- Lotes con margen mayor (optimización financiera)

### 9.3. Reservas Temporales (Pedidos sin Confirmar)

```csharp
// Al crear pedido, reservar stock sin descontarlo
await _loteAsignacionService.ReservarStockAsync(lotes, pedidoId);

// Al cancelar pedido, liberar reservas
await _loteAsignacionService.LiberarReservasAsync(lotes, pedidoId);

// Al confirmar pedido, convertir reserva en descuento definitivo
await _loteAsignacionService.ConfirmarVentaYDescontarStockAsync(...);
```

---

## 10. CONCLUSIÓN

### Sistema de Automatización de Lotes Diseñado Para:

✅ **Velocidad:** De 5-10 minutos a < 1 minuto por factura  
✅ **Precisión:** Cero errores humanos en asignación  
✅ **Trazabilidad:** Completa, automática, legal  
✅ **FIFO:** Garantizado por algoritmo  
✅ **Escalabilidad:** Funciona con 10 o 10,000 lotes  
✅ **Mantenibilidad:** Código limpio, testeado, extensible  
✅ **UX:** Usuario no gestiona lotes, solo productos y cantidades  
✅ **Compliance:** Preparado para auditorías alimentarias  

**Este es el CORE DIFERENCIAL del sistema BuenaTierra.**

---

**Próximo documento:** Flujos de negocio completos (pedido → albarán → factura, producción → lotes → stock)
