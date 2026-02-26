# CHECKLIST DE DESARROLLO - SISTEMA BUENATIERRA

> **Última actualización:** 26 Febrero 2026 (2) — MODELO_NEGOCIO_NUEVO.md  
> **Estado general:** MVP Backend + Frontend completado ✅ | PDF + Excel ✅ | Albaranes + Pedidos + Lotes + Trazabilidad ✅ | Dashboard KPIs reales ✅ | Módulo Repartidor POS ✅ | Navegación por rol ✅ | Informes y Analytics ✅ | Ingredientes & Alérgenos (CE 1169/2011) ✅ | Trazabilidad directa ✅ | Export Excel ✅ | Trazabilidad 3 tabs + Recall ✅ | Gestión de usuarios (Admin) ✅ | Rotación FIFO Analytics ✅ | Dashboard Multi-Tab ✅ | Performance (Cache + Pool + Índices) ✅ | Atajos de teclado ✅ | Responsive Mobile ✅ | Tests xUnit 23/23 ✅ | Docs completa ✅ | Lote auto-fill ddMMyyyy ✅ | Alérgenos en Productos (selector) ✅ | Botones PDF/Excel Facturación ✅ | APP_ESCRITORIO.md ✅ | Gobernanza del repositorio ✅

---

## FASE 1: DISEÑO Y ARQUITECTURA ✅ COMPLETADO

### Base de Datos ✅
- [x] Modelo de dominio completo
- [x] Esquema de base de datos PostgreSQL
- [x] Definición de entidades y relaciones
- [x] Índices y optimizaciones
- [x] Triggers y stored procedures para automatización
- [x] Sistema de auditoría
- [x] Sistema de trazabilidad
- [x] Políticas de backup

### Arquitectura General ✅
- [x] Arquitectura física (infraestructura)
- [x] Arquitectura lógica (capas)
- [x] Arquitectura de datos
- [x] Modelo de comunicación cliente-servidor
- [x] Diseño de API interna
- [x] Sistema de autenticación y autorización
- [x] Gestión de sesiones multiusuario

### Automatización de Lotes ✅
- [x] Algoritmo FIFO de asignación automática
- [x] Sistema de split automático de líneas
- [x] Motor de cálculo de disponibilidad
- [x] Trazabilidad completa lote → cliente
- [x] Gestión de stock por lote

### Sistema de Facturación ✅
- [x] Modelo de facturación simplificada
- [x] Sistema de series y numeración
- [x] Conversión albarán → factura
- [x] Generación de PDF
- [x] Exportación a Excel
- [x] Gestión de datos fiscales

### Roles y Seguridad ✅
- [x] Definición de roles (Admin, Obrador, Repartidor)
- [x] Matriz de permisos
- [x] Segregación de datos por rol
- [x] Sistema de auditoría de accesos
- [x] Encriptación de datos sensibles

## FASE 2: DESARROLLO MVP

### Backend
- [x] API REST en ASP.NET Core 9 — 0 errores
- [x] Servicios de negocio (lógica)
- [x] Repositorios y acceso a datos (UoW + CQRS parcial)
- [x] Sistema de logging (Serilog)
- [x] Manejo de errores y excepciones
- [x] Validaciones de negocio

### Frontend Obrador
- [x] Módulo de clientes
- [x] Módulo de productos/artículos
- [x] Módulo de producción y lotes
- [x] Módulo de stock (vista desde Lotes)
- [x] Módulo de albaranes
- [x] Módulo de facturas
- [x] Módulo de pedidos
- [x] Dashboard KPIs reales (8 métricas, auto-refresh 60s)
- [x] Dashboard con actividad reciente (últimas facturas + pedidos activos)
- [x] Acciones rápidas desde dashboard

### Frontend Repartidor
- [x] Sistema de facturación rápida (POS)
- [x] Selección de productos desde catálogo central
- [x] Asignación automática de lotes (FIFO via /api/facturas/crear)
- [x] Gestión de clientes propios
- [x] Impresión directa de facturas (PDF)
- [x] Consulta de stock disponible
- [x] Navegación diferenciada por rol (sidebar dinámico)

### Infraestructura
- [x] Servidor Docker con PostgreSQL (postgres:15, puerto 5433)
- [x] Servidor de aplicación (ASP.NET Core 9, puerto 5001)
- [ ] Configuración de red y firewall (producción)
- [ ] Sistema de backup automático
- [ ] Monitorización básica

## FASE 3: FUNCIONALIDADES AVANZADAS

### Trazabilidad
- [x] Sistema completo de trazabilidad alimentaria (Reglamento CE 178/2002)
- [x] Registro de ingredientes por producto
- [x] Registro de alérgenos (14 CE 1169/2011 precargados)
- [x] Ficha de alérgenos por producto (declaración legal lista)
- [x] Trazabilidad inversa (lote → cliente) — TrazabilidadController GET /
- [x] Trazabilidad directa (ingrediente → productos → lotes → clientes) — GET /ingrediente/{id}
- [x] Trazabilidad por producto (todos los lotes + movimientos) — GET /producto/{id}
- [x] Informes de trazabilidad para auditorías (Excel exportable)
- [x] Frontend de consulta de trazabilidad por lote/producto/cliente
- [x] Trazabilidad.tsx — 3 tabs: Movimientos por fecha / Por producto / Recall por ingrediente
- [x] TabIngrediente: herramienta recall completa — KPIs + productos+lotes + clientes afectados (aviso Art.19)

### Gestión de usuarios
- [x] UsuariosController.cs — CRUD Admin-only (GET/POST/PUT/DELETE + cambiar-password + me)
- [x] Protección: no eliminar propio usuario, no degradar último admin activo
- [x] BCrypt.HashPassword en creación y cambio de contraseña
- [x] Usuarios.tsx — tabla con rol badge (Admin/Obrador/Repartidor), activo toggle, último acceso
- [x] Modales: crear usuario, editar, cambiar contraseña, confirmar desactivar
- [x] Nav item «Usuarios» con icono Shield visible sólo para rol Admin
- [x] Ruta /usuarios en App.tsx

### Ingredientes & Alérgenos (CE 1169/2011)
- [x] Dominio: entidades Ingrediente, Alergeno, IngredienteAlergeno, ProductoIngrediente
- [x] 14 alérgenos reglamentarios precargados en DB
- [x] IUnitOfWork extendido con repos Ingrediente/Alergeno/IngredienteAlergeno/ProductoIngrediente
- [x] AlergenosController (GET /api/alergenos)
- [x] IngredientesController (CRUD + sync alérgenos + asignación por producto + ficha)
- [x] Frontend Ingredientes.tsx — tab ingredientes (tabla + panel create/edit + 14 checkboxes)
- [x] Frontend Ingredientes.tsx — tab fichas (selector producto + matriz 14-slot + asignación)
- [x] Declaración legal para etiqueta generada automáticamente
- [x] Nav item «Ingredientes» en sidebar Obrador
- [x] Ruta /ingredientes en App.tsx
- [x] Ficha alérgenos accesible desde Productos (botón «Ficha» por producto, modal 14-slot)
- [x] Backend 0 errores · Frontend 2544 módulos

### Reporting y Analytics
- [x] Informes de ventas (gráfica área diaria + barras por conteo)
- [x] Informes de stock (gráfica barras horizontal por producto + alerta visual)
- [x] Informes de producción (barras apiladas neto/merma + top productos)
- [x] Análisis de clientes (ranking top 20, ticket medio, última compra)
- [x] KPIs consolidados por tab (importes, bases, conteos)
- [x] Filtro por rango de fechas (desde/hasta)
- [x] Exportación a Excel (.xlsx) con ClosedXML — GET /api/reportes/export?tipo=ventas|stock|produccion|clientes
- [x] Exportación de stock con alerta visual (filas rojas=caducado, amarillo=bajo stock)
- [x] Análisis de rotación de productos (cálculo salidas/stock)
- [x] Dashboard ejecutivo avanzado (resumen multi-tab)

### Integraciones Futuras
- [ ] Preparación para integración contable
- [ ] Preparación para SII (AEAT)
- [ ] API para integraciones externas
- [ ] Exportación a formatos estándar

## FASE 4: OPTIMIZACIÓN Y ESCALABILIDAD

### Performance
- [x] Optimización de consultas
- [x] Caché de datos frecuentes (AddMemoryCache + AddResponseCaching)
- [x] Índices adicionales (8 índices compuestos en tablas principales)
- [ ] Particionado de tablas históricas
- [x] Pool de conexiones (Npgsql Min=5 Max=50)

### UX/UI
- [x] Optimización de flujos operativos (POS sin escritura manual)
- [x] Velocidad operativa repartidor (POS click-to-add)
- [x] Atajos de teclado (Alt+1..0 + modal «?»)
- [x] Velocidad de carga < 2 segundos
- [x] Interfaz responsive (mobile sidebar hamburger)
- [ ] Modo offline parcial (si aplica)

### Escalabilidad
- [ ] Diseño para múltiples obradores
- [ ] Diseño para múltiples repartidores
- [ ] Sistema de configuración multi-empresa
- [ ] Replicación de base de datos

## FASE 5: TESTING Y DOCUMENTACIÓN

### Testing
- [x] Tests unitarios — 23 tests xUnit, 100% pasan (LoteAsignacion + Domain + Application)
- [ ] Tests de integración (con BD real)
- [ ] Tests de sistema (e2e Playwright)
- [ ] Tests de carga (k6)
- [ ] Tests de seguridad (OWASP ZAP baseline)

### Documentación
- [x] Manual de usuario (Obrador) — docs/manual-obrador.md
- [x] Manual de usuario (Repartidor) — docs/manual-repartidor.md
- [x] Manual técnico — docs/manual-tecnico.md
- [x] Manual de instalación — docs/manual-instalacion.md
- [ ] Manual de mantenimiento
- [x] Documentación de API — docs/api.md + Swagger /swagger

## FASE 6B: CORRECCIONES Y MEJORAS UX (23 Jun 2025) ✅ COMPLETADO

### Producción — correcciones críticas
- [x] Fix: nombres de producto no aparecían en tabla (mismatch DTO → devuelve flat DTO desde controller)
- [x] Fix: estado mostraba número entero → ahora devuelve string `p.Estado.ToString()`
- [x] Fix: columna Lote siempre mostraba `—` → `GetByFechaAsync` ahora incluye `.Include(p => p.Lotes)`
- [x] Feature: lote auto-fill formato `ddMMyyyy` al crear producción (editable por usuario)
- [x] Backend: campo `codigo_lote_sugerido` añadido a tabla `producciones` y entidad EF
- [x] Backend: `FinalizarProduccionAsync` usa `CodigoLoteSugerido` o genera `ddMMyyyy` automático con dedup

### Productos — gestión de alérgenos directos
- [x] Backend: `GET /api/productos/{id}/alergenos-directos` — devuelve `{ alergenoIds: int[] }`
- [x] Backend: `PUT /api/productos/{id}/alergenos-directos` — sincroniza alérgenos con ingrediente especial `__direct_{id}__`
- [x] Frontend: selector de alérgenos en modal crear/editar producto (tab "Alérgenos")
- [x] Frontend: 14 checkboxes con emoji, texto de etiqueta generado automáticamente
- [x] Frontend: sincronización al editar producto existente via `useEffect`

### Facturación — botones de descarga
- [x] Fix: botones PDF y Excel en tabla de facturas (antes no existían en UI)
- [x] Fix: botones PDF y Excel en modal de detalle de factura
- [x] Helper `downloadBlob()` para descarga vía axios blob + anchor DOM

### Documentación
- [x] docs/APP_ESCRITORIO.md — guía empaquetado Electron + Tauri, servicio Windows, escenarios BD

---

## FASE 6: DESPLIEGUE Y PRODUCCIÓN

### Despliegue
- [ ] Instalación en servidor de producción (INF-04)
- [ ] Configuración de red y firewall (INF-01)
- [ ] Configuración de seguridad (variables entorno, HTTPS, nginx)
- [ ] Backup automático PostgreSQL antes del despliegue (INF-02)
- [ ] Migración de datos (si aplica)
- [ ] Pruebas en producción / smoke tests (INF-05)
- [ ] Plan de rollback documentado y probado (INF-06)

### Formación
- [ ] Formación a usuarios de oficina (FOR-01)
- [ ] Formación a repartidores — flujo POS completo (FOR-02)
- [ ] Material de soporte: FAQ + vídeos cortos (FOR-03)
- [ ] Canal de soporte activo (FOR-04)

### Mantenimiento Post-Despliegue
- [ ] Plan de mantenimiento continuo y SLA (FOR-05)
- [ ] Sistema de tickets/soporte operativo
- [ ] Procedimientos de actualización documentados (DOC-02)
- [ ] Manual de mantenimiento técnico (DOC-01)
- [ ] Monitorización básica activa (INF-03)

---

## FASE 6C: GOBERNANZA DEL REPOSITORIO ✅ COMPLETADO (26 Feb 2026)

### Sistema de Gobierno AI
- [x] `tasks/todo.md` — plan activo de sesión (agent-rules.md operativo)
- [x] `tasks/lessons.md` — bucle de auto-mejora con 2 lecciones iniciales + reglas activas
- [x] `tasks/backlog.md` — 25 ítems clasificados P1-P4 con esfuerzo estimado
- [x] `tasks/decisions/` — 4 ADRs: Clean Architecture, FIFO lotes, EF snake_case, QuestPDF
- [x] `.github/memory/context.md` — snapshot completo del sistema (stack, módulos, endpoints, DB)
- [x] `.github/memory/known-issues.md` — 4 issues activos con workaround documentado
- [x] `governance/CHANGELOG.md` — historial versionado retroactivo v0.1→v0.9
- [x] `governance/debt.md` — 8 deudas técnicas clasificadas por impacto/urgencia/esfuerzo
- [x] `governance/quality-gates.md` — 7 criterios de "done" diferenciados por tipo de tarea
- [x] `agent-rules.md` corregido — formato limpio, backticks cerrados, orden lógico de secciones
- [x] `docs/MODELO_NEGOCIO_NUEVO.md` — modelo de negocio completo (13 fases, del ingrediente al cliente final)

---

## FASE 7: TRAZABILIDAD FÍSICA — BLISTERS Y CAJAS MIXTAS

> **Problema identificado (26 Feb 2026):**
> El repartidor entrega cajas con 3 blisters. Una caja puede contener blisters de **diferentes lotes**.
> La etiqueta física del blister tiene un código de barras de tienda pero **no identifica el lote** de forma escaneable.
> El sistema FIFO ya calcula qué lotes componen cada pedido, pero no hay puente entre el cálculo digital y el picking físico.
> Objetivo: solución **rápida, automática y eficiente** sin escritura manual. Ver análisis completo en `tasks/decisions/ADR-005-trazabilidad-blisters.md`.

### Investigación y Diseño (PENDIENTE)
- [ ] Confirmar con el cliente: ¿las cajas se empacan mezclando lotes deliberadamente o es ocasional?
- [ ] Verificar si las etiquetas actuales cumplen CE 178/2002 Art.18 (lote en etiqueta es requisito legal)
- [ ] Confirmar el flujo físico: obrador empaca cajas → repartidor recoge cajas → entrega al cliente
- [ ] Crear ADR-005 con la decisión de solución tras el análisis
- [ ] Diseñar modelo de datos para trazabilidad a nivel de caja/blíster (si aplica)

### Opción A — Disciplina de Empaquetado + Instrucción de Picking (Coste cero, impacto inmediato)
- [ ] Definir regla operativa: una caja = un lote siempre que sea posible
- [ ] Añadir pantalla "Preparación de reparto" en POS del repartidor
  - [ ] Al crear albarán/factura, mostrar desglose: "Prepara: 3 blisters Lote 010226 + 2 blisters Lote 020226"
  - [ ] Instrucción de picking generada automáticamente desde el FIFO existente
  - [ ] El repartidor confirma preparación → queda registrado en el albarán
- [ ] Backend: endpoint `GET /api/albaranes/{id}/instruccion-picking` — devuelve desglose lote/cantidad
- [ ] Frontend: componente `PickingInstruccion` en vista de albarán repartidor

### Opción B — Lote visible en etiqueta física (Cumplimiento legal + trazabilidad física)
- [ ] Modificar plantilla de etiqueta para incluir número de lote (ddMMyyyy) en texto legible
- [ ] Evaluar añadir código QR al blister con: `{productoId}|{loteId}|{fechaProduccion}|{caducidad}`
- [ ] Si hay QR en blister: implementar endpoint `GET /api/lotes/scan/{qrCode}` — devuelve info completa
- [ ] Integrar escáner de cámara en app móvil/tablet del repartidor (WebRTC o app nativa)

### Opción C — Trazabilidad de caja como unidad logística (Solución completa, mayor inversión)
- [ ] Diseñar entidad `CajaLogistica` (id, lote_lineas[{loteId, cantidad}], estado, destinatario)
- [ ] Flujo: obrador empaca caja → registra composición → asigna a repartidor
- [ ] Repartidor escanea caja al entregar → sistema registra caja→cliente
- [ ] Migración DB + endpoints + UI para gestión de cajas
- [ ] Generación de etiqueta de caja con QR propio

### Testing Trazabilidad Física
- [ ] Test: split correcto de picking instruction desde FIFO (unitario)
- [ ] Test: escenario caja mixta — la instrucción muestra ambos lotes
- [ ] Test: escenario lote agotado en mitad de caja — continúa con siguiente lote

---

## FASE 8: TESTING COMPLETO

### Tests de Integración (BD real)
- [ ] Configurar `WebApplicationFactory` + PostgreSQL de test en Docker (TST-01)
- [ ] Tests de integración: flujo completo crear albarán → convertir factura → verificar stock
- [ ] Tests de integración: FIFO — pedido con múltiples lotes genera split correcto
- [ ] Tests de integración: trazabilidad — recall de ingrediente devuelve clientes correctos
- [ ] Tests de integración: autenticación y autorización por rol

### Tests E2E (Playwright)
- [ ] Configurar Playwright en `tests/` (TST-02)
- [ ] E2E: flujo obrador (crear cliente → producto → producción → albarán → factura)
- [ ] E2E: flujo repartidor POS (seleccionar productos → generar factura → descargar PDF)
- [ ] E2E: flujo trazabilidad (buscar ingrediente → recall → exportar Excel)

### Tests de Carga
- [ ] Configurar k6 (TST-03)
- [ ] Escenario: 10 repartidores concurrentes creando facturas simultáneamente
- [ ] Escenario: FIFO bajo concurrencia (no oversell de lotes)

### Tests de Seguridad
- [ ] OWASP ZAP baseline scan (TST-04)
- [ ] Verificar que endpoints de Admin no son accesibles con rol Obrador/Repartidor
- [ ] Verificar que el repartidor no puede acceder a datos de otro repartidor

---

## FASE 9: MEJORAS TÉCNICAS Y DEUDA

### Deuda Técnica Prioritaria
- [ ] Corregir `HasCheckConstraint` API obsoleta en EF Core 9 (DT-004 / KI-001)
- [ ] Implementar tabla `audit_log` para trazabilidad de accesos (DT-007 / NEW-03)
- [ ] CI/CD pipeline GitHub Actions: build + test + docker push (DT-003 / NEW-01)
- [ ] Health check endpoint expuesto en UI de administración (NEW-02)
- [ ] Redirigir `api_err.txt` / `api_out.txt` a `.gitignore` o `tasks/logs/` (DT-008 / KI-003)

### Performance Avanzada
- [ ] Particionado de tablas históricas (movimientos_stock) cuando >1M filas (INF-07)
- [ ] Evaluar FEFO como alternativa/complemento a FIFO para productos con caducidad variable (DT-006)

### Exportación PDF
- [ ] Evaluar PDF/A para archivo legal de facturas (NEW-05)

---

## FASE 10: INTEGRACIONES EXTERNAS

### Contabilidad y AEAT
- [ ] Definir formato de salida para integración contable (A3, ContaPlus, etc.) (INT-01)
- [ ] Módulo SII (Suministro Inmediato de Información) — declaración IVA online AEAT (INT-02)
- [ ] Certificado digital para SII (Clase 2 o sello de empresa)
- [ ] API pública con autenticación OAuth2 / API key para integraciones externas (INT-03)
- [ ] Exportación XML EDICOM / CSV AEAT (INT-04)

### Escalabilidad Multi-Empresa
- [ ] Evaluación de arquitectura multi-tenant (ESC-01)
- [ ] Sistema de configuración por obrador (ESC-03)
- [ ] Replicación de base de datos para alta disponibilidad (INF-08)

---

