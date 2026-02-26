# CONTEXTO DEL SISTEMA — SNAPSHOT

> Archivo de memoria persistente para el agente AI.
> Leer al inicio de cualquier sesión de trabajo.
> Actualizar cuando cambie el stack, arquitectura, configuración o estado de módulos.
> **Última actualización:** 2026-02-26

---

## IDENTIDAD DEL PROYECTO

**Nombre:** BuenaTierra  
**Tipo:** Sistema de gestión para obrador de pastelería con modelo de reventa por repartidores independientes  
**Estado:** MVP funcional completo en desarrollo local. Pendiente despliegue en producción.  
**Fase actual:** Post-MVP — correcciones, gobernanza, preparación para producción

---

## STACK TÉCNICO CONFIRMADO

### Backend
- **Runtime:** .NET 9 (C#)
- **Framework:** ASP.NET Core 9 (Minimal + Controllers)
- **ORM:** EF Core 9 con Npgsql
- **Convención DB:** `UseSnakeCaseNamingConvention()` — todas las tablas/columnas en snake_case
- **PDF:** QuestPDF (fluent API, stream directo)
- **Excel:** EPPlus (`.xlsx` export)
- **Auth:** JWT Bearer (roles: Admin, Obrador, Repartidor)
- **Logging:** Serilog
- **Cache:** `IMemoryCache` + `AddResponseCaching`
- **Tests:** xUnit — 23 tests, 100% pasan

### Frontend
- **Framework:** React 18 + Vite + TypeScript
- **Estado servidor:** TanStack Query v5
- **Estilos:** Tailwind CSS
- **HTTP:** Axios
- **Gráficas:** Recharts
- **Internacionalización:** Español (toda la UI)

### Base de datos
- **Motor:** PostgreSQL 15.4
- **Puerto:** 5433 (Docker local)
- **Contenedor:** `postgres:15` vía Docker Compose
- **Convención:** snake_case, sin comillas en SQL nativo

### Infraestructura
- **Contenedor API:** Docker Compose (`docker-compose.yml` + `docker-compose.dev.yml`)
- **Proxy:** nginx (configurado, pendiente producción)
- **Puertos locales:** API :5001 / Frontend :5173 / DB :5433

---

## ARQUITECTURA — PROYECTOS EN LA SOLUCIÓN

```
BuenaTierra.sln
├── src/
│   ├── BuenaTierra.Domain/         ← Entidades, enums, interfaces base
│   ├── BuenaTierra.Application/    ← Servicios de aplicación, DTOs, interfaces
│   ├── BuenaTierra.Infrastructure/ ← EF Core, repos, servicios concretos (PDF, Excel, Lotes)
│   └── BuenaTierra.API/            ← Controllers, middleware, configuración DI
└── tests/
    └── BuenaTierra.Tests/          ← xUnit — 23 tests
```

---

## MÓDULOS ACTIVOS (estado a 2026-02-26)

| Módulo | Backend | Frontend | Notas |
|--------|---------|----------|-------|
| Clientes | ✅ | ✅ | CRUD completo |
| Productos | ✅ | ✅ | Con alérgenos directos |
| Ingredientes & Alérgenos | ✅ | ✅ | 14 CE 1169/2011 precargados |
| Producción | ✅ | ✅ | Lote auto-fill ddMMyyyy |
| Lotes | ✅ | ✅ | FIFO automático |
| Stock | ✅ | ✅ | Vista desde Lotes |
| Albaranes | ✅ | ✅ | Con RE + retención |
| Pedidos | ✅ | ✅ | |
| Facturas | ✅ | ✅ | Con RE + retención + PDF + Excel |
| Trazabilidad | ✅ | ✅ | 3 tabs: movimientos / producto / recall |
| Usuarios (Admin) | ✅ | ✅ | CRUD + cambiar password |
| Dashboard KPIs | ✅ | ✅ | 8 métricas, auto-refresh 60s |
| Informes & Analytics | ✅ | ✅ | Ventas/Stock/Producción/Clientes |
| POS Repartidor | ✅ | ✅ | Facturación rápida sin escritura manual |
| Exportación Excel | ✅ | ✅ | Múltiples entidades |

---

## BASE DE DATOS — TABLAS PRINCIPALES

```
clientes
productos
ingredientes / alergenos / ingrediente_alergenos / producto_ingredientes
producciones / lotes
stock_lotes (stock por lote)
movimientos_stock
pedidos / pedido_lineas
albaranes / albaran_lineas          ← columnas RE + retención añadidas
facturas / factura_lineas           ← columnas RE + retención añadidas
trazabilidad_movimientos
usuarios
```

**Migraciones EF aplicadas:** Todas al día. Última: columnas RE/retención en albaranes + facturas.

---

## ENDPOINTS API CRÍTICOS

```
POST /api/facturas/crear                    ← FIFO automático + split lotes
POST /api/albaranes/{id}/convertir-factura  ← Copia lotes del albarán (NO re-ejecuta FIFO)
GET  /api/trazabilidad                      ← Trazabilidad inversa lote→cliente
GET  /api/trazabilidad/ingrediente/{id}     ← Recall por ingrediente
GET  /api/reportes/export?tipo=...          ← Excel trazabilidad exportable
GET  /api/facturas/{id}/pdf                 ← PDF stream directo
GET  /api/albaranes/{id}/pdf                ← PDF stream directo
```

---

## CONFIGURACIÓN DE ARRANQUE

Ver `iniciar_proyecto.md` en la raíz para el procedimiento completo. Secuencia:
1. `docker compose -f docker-compose.dev.yml up -d` — PostgreSQL healthy en :5433
2. `dotnet build BuenaTierra.sln` — 0 errores, 2 warnings (HasCheckConstraint deprecado)
3. API: `dotnet run` desde `src/BuenaTierra.API/` — escucha en :5001
4. Frontend: `npm run dev` desde `frontend/` — escucha en :5173

---

## ROLES Y ACCESO

| Rol | Acceso |
|-----|--------|
| Admin | Todo + gestión usuarios |
| Obrador | Operativa completa del obrador (sin gestión usuarios) |
| Repartidor | POS propio + catálogo/lotes/trazabilidad del obrador (solo lectura) |

---

## ARCHIVOS DE GOBIERNO

```
tasks/todo.md           ← Plan activo de sesión (obligatorio antes de tarea no trivial)
tasks/lessons.md        ← Lecciones aprendidas + reglas del agente
tasks/backlog.md        ← Ítems pendientes clasificados
tasks/decisions/        ← ADRs (Architecture Decision Records)
.github/memory/context.md       ← Este archivo
.github/memory/known-issues.md  ← Problemas conocidos activos
governance/CHANGELOG.md         ← Historial de versiones
governance/debt.md              ← Deuda técnica registrada
governance/quality-gates.md     ← Criterios de "done"
docs/MODELO_NEGOCIO_NUEVO.md    ← Modelo operativo completo: 13 fases del ingrediente al cliente
```
