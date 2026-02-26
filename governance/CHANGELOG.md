# CHANGELOG — BUENATIERRA

> Historial versionado de cambios del sistema.
> Formato: [Versión] — Fecha — Descripción del bloque de trabajo.
> Retroactivo desde el estado actual del sistema.

---

## [0.9.0] — 2026-02-26 — Implementación de sistema de gobierno del repositorio

### Añadido
- Carpeta `tasks/` con `todo.md`, `lessons.md`, `backlog.md`
- `tasks/decisions/` con 4 ADRs: Clean Architecture, FIFO lotes, EF Core snake_case, QuestPDF
- `.github/memory/` con `context.md` (snapshot del sistema) y `known-issues.md`
- `governance/` con `CHANGELOG.md`, `debt.md`, `quality-gates.md`
- Bucle de auto-mejora del agente AI operativo (lessons.md con 2 lecciones iniciales)
- Backlog clasificado (P1-P4) con 25 ítems migrados desde check_list.md + 5 propuestas nuevas

---

## [0.8.0] — 2025-06-23 — Correcciones UX + Alérgenos en Productos + Botones PDF/Excel

### Corregido
- Nombres de producto no aparecían en tabla de producción (mismatch DTO)
- Estado de producción mostraba número entero en lugar de string
- Columna Lote siempre mostraba `—` (faltaba `.Include(p => p.Lotes)`)
- Botones PDF y Excel ausentes en tabla y modal de facturas

### Añadido
- Lote auto-fill formato `ddMMyyyy` al crear producción (editable)
- Campo `codigo_lote_sugerido` en tabla `producciones` y entidad EF
- `FinalizarProduccionAsync` usa `CodigoLoteSugerido` o genera código automático con dedup
- Selector de alérgenos directos en modal crear/editar producto (14 checkboxes CE 1169/2011)
- Helper `downloadBlob()` en frontend para descarga vía axios blob + anchor DOM
- `docs/APP_ESCRITORIO.md` — guía empaquetado Electron + Tauri + servicio Windows

---

## [0.7.0] — 2025-06-XX — RE (Recargo Equivalencia) y Retención fiscal

### Añadido
- Campos `re` y `retencion` en entidades `Factura`, `FacturaLinea`, `Albaran`, `AlbaranLinea`
- Cálculo de RE y retención en `FacturaService` y `AlbaranesController`
- Filas condicionales RE y retención en PDFs de albarán y factura (`.ShowIf(condition)`)
- Migraciones EF: 4 columnas nuevas en `albaranes`, `albaran_lineas`, `facturas`, `factura_lineas`

---

## [0.6.0] — 2025-06-XX — Gestión de usuarios, Dashboard Multi-Tab, Performance

### Añadido
- `UsuariosController` — CRUD Admin-only con BCrypt
- Protecciones: no eliminar propio usuario, no degradar último admin activo
- `Usuarios.tsx` — tabla con badges de rol, modales crear/editar/password/desactivar
- Dashboard ejecutivo multi-tab con KPIs consolidados
- Análisis de rotación de productos en informes
- `AddMemoryCache` + `AddResponseCaching` en pipeline
- 8 índices compuestos adicionales en tablas principales
- Pool de conexiones Npgsql Min=5 Max=50
- Atajos de teclado (Alt+1..0 + modal «?»)
- Responsive mobile (sidebar hamburger)

---

## [0.5.0] — 2025-06-XX — Ingredientes, Alérgenos, Informes y Trazabilidad 3 tabs

### Añadido
- Entidades: `Ingrediente`, `Alergeno`, `IngredienteAlergeno`, `ProductoIngrediente`
- 14 alérgenos reglamentarios CE 1169/2011 precargados en DB
- `AlergenosController`, `IngredientesController` (CRUD + sync + asignación + ficha)
- `Ingredientes.tsx` — tab ingredientes + tab fichas
- `Trazabilidad.tsx` — 3 tabs: Movimientos por fecha / Por producto / Recall por ingrediente
- Tab Ingrediente: herramienta recall con KPIs + productos/lotes + clientes afectados (Art.19 CE 178/2002)
- Exportación Excel de trazabilidad (ClosedXML → migrado a EPPlus)

---

## [0.4.0] — 2025-06-XX — Módulo Repartidor POS y navegación por rol

### Añadido
- Sistema POS para repartidor (facturación rápida sin escritura manual)
- Catálogo de productos central accesible para repartidor
- Asignación automática de lotes vía `/api/facturas/crear`
- Sidebar dinámico por rol (Obrador vs Repartidor)
- Consulta de stock disponible para repartidor

---

## [0.3.0] — 2025-06-XX — MVP Backend + Frontend completo

### Añadido
- 14 controllers (Albaranes, Pedidos, Facturas, Clientes, Productos, Lotes, Stock, Produccion, Trazabilidad, Reportes, Dashboard, Auth, ...)
- `LoteAsignacionService` — FIFO + split automático de líneas
- `StockService` — gestión por lote
- Conversión albarán → factura
- Factura simplificada con numeración automática y series
- Dashboard KPIs reales (8 métricas, auto-refresh 60s)
- Exportación Excel múltiple (EPPlus)
- Tests xUnit: 23 tests, 100% pasan

---

## [0.2.0] — 2025 — Diseño y arquitectura

### Añadido
- Clean Architecture (4 proyectos en solución)
- Schema PostgreSQL completo con índices, triggers y auditoría
- Sistema de trazabilidad alimentaria CE 178/2002
- Modelo de dominio: entidades y relaciones completas
- Docker Compose dev + prod

---

## [0.1.0] — 2025 — Diseño inicial

### Añadido
- Definición de requisitos funcionales y no funcionales
- Modelo de negocio: obrador + repartidores independientes
- Roles: Admin / Obrador / Repartidor
- `docs/` con 14 documentos de diseño, arquitectura, MVP y manuales
