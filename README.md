# SISTEMA BUENATIERRA

## Sistema de Gestión Integral para Obrador con Automatización de Lotes y Trazabilidad

![Estado](https://img.shields.io/badge/Estado-Diseño%20Completado-green)
![Versión](https://img.shields.io/badge/Versión-0.1--alpha-blue)
![Licencia](https://img.shields.io/badge/Licencia-Privado-red)

---

## 📋 Descripción del Proyecto

**BuenaTierra** es un sistema informático profesional diseñado para la digitalización completa de un obrador de pasteles/dulces con modelo de reventa mediante repartidores independientes.

### Problema que Resuelve

El sistema actual es manual, lento y propenso a errores. El problema crítico es la facturación con múltiples lotes del mismo producto, que obliga a escribir manualmente cada lote, generando:
- **Lentitud:** 5-10 minutos por factura
- **Errores:** Asignación incorrecta de lotes
- **Frustración:** Proceso tedioso y repetitivo

### Solución

Sistema automatizado que:
- ✅ Asigna lotes automáticamente usando algoritmo FIFO
- ✅ Reduce tiempo de facturación a < 2 minutos
- ✅ Elimina errores humanos en asignación
- ✅ Garantiza trazabilidad completa (compliance alimentario)
- ✅ Gestiona stock inteligentemente por producto y lote
- ✅ Permite facturación ultra-rápida para repartidores (< 30 segundos)

---

## 🎯 Características Principales

### Core (MVP)
- 🏭 **Gestión de Producción:** Registro diario con generación automática de lotes
- 📦 **Stock Inteligente:** Stock por producto + lote con FIFO automático
- 🧾 **Facturación Automatizada:** Asignación automática de lotes sin intervención manual
- 📊 **Trazabilidad Full:** Seguimiento completo lote → cliente para auditorías
- 👥 **Multi-Usuario:** Roles diferenciados (Admin, Obrador, Repartidor)
- 🖨️ **Impresión Directa:** Generación PDF y envío a impresora

### Avanzado (Post-MVP)
- 📝 Gestión de Pedidos y Albaranes
- 🧪 Ingredientes y Alérgenos (trazabilidad upstream)
- 📈 Reporting y Analytics avanzado
- 🚚 Módulo específico para Repartidores (ultra-rápido)
- 🔗 Integraciones con contabilidad y fiscal (SII/AEAT)

---

## 🏗️ Arquitectura Técnica

```
┌─────────────────────────────────────────────────┐
│         CLIENTE DESKTOP (WPF .NET 8)            │
│  - Cliente Obrador (gestión completa)           │
│  - Cliente Repartidor (facturación rápida)      │
└─────────────────┬───────────────────────────────┘
                  │ HTTPS / REST API
                  ▼
┌─────────────────────────────────────────────────┐
│      API BACKEND (ASP.NET Core 8)               │
│  - Autenticación JWT                            │
│  - Lógica de negocio                            │
│  - Motor de asignación de lotes FIFO            │
│  - Servicios de dominio                         │
└─────────────────┬───────────────────────────────┘
                  │ Entity Framework Core
                  ▼
┌─────────────────────────────────────────────────┐
│      BASE DE DATOS (PostgreSQL 15)              │
│  - Stored Procedures                            │
│  - Triggers de auditoría                        │
│  - Índices optimizados                          │
└─────────────────────────────────────────────────┘
```

### Stack Tecnológico

**Backend:**
- ASP.NET Core 8 (C#)
- Entity Framework Core 8
- PostgreSQL 15
- Docker + Docker Compose

**Frontend:**
- WPF .NET 8 (Windows Desktop)
- MVVM Pattern
- Material Design

**Infraestructura:**
- Ubuntu Server 22.04
- Nginx (reverse proxy)
- Automatic Backups
- Prometheus + Grafana (monitoring)

---

## 📁 Estructura del Proyecto

```
BuenaTierra/
├── docs/                                  # Documentación técnica completa
│   ├── 01_DATABASE_DESIGN.md              # Diseño de base de datos
│   ├── 02_ARCHITECTURE.md                 # Arquitectura del sistema
│   ├── 03_SISTEMA_LOTES_AUTOMATIZADO.md   # Motor FIFO de lotes
│   ├── 04_FLUJOS_NEGOCIO.md               # Procesos operativos
│   └── 05_MVP_Y_ROADMAP.md                # Plan de desarrollo
│
├── src/                                   # Código fuente (futuro)
│   ├── BuenaTierra.API/                   # Backend API
│   ├── BuenaTierra.Application/           # Lógica de aplicación
│   ├── BuenaTierra.Domain/                # Dominio y entidades
│   ├── BuenaTierra.Infrastructure/        # Acceso a datos
│   └── BuenaTierra.Shared/                # Código compartido
│
├── clients/                               # Clientes desktop (futuro)
│   ├── BuenaTierra.Desktop.Obrador/       # Cliente oficina
│   └── BuenaTierra.Desktop.Repartidor/    # Cliente repartidor
│
├── tests/                                 # Tests (futuro)
│   ├── BuenaTierra.UnitTests/
│   ├── BuenaTierra.IntegrationTests/
│   └── BuenaTierra.E2ETests/
│
├── scripts/                               # Scripts de deployment
│   ├── database/                          # Scripts SQL
│   ├── docker/                            # Docker configs
│   └── deployment/                        # Deployment scripts
│
├── check_list.md                          # Checklist de progreso
└── README.md                              # Este archivo
```

---

## 📚 Documentación

### Documentos Principales

1. **[01_DATABASE_DESIGN.md](docs/01_DATABASE_DESIGN.md)**
   - Modelo de dominio completo
   - Esquema de base de datos PostgreSQL
   - Stored procedures y triggers
   - Índices y optimizaciones
   - Sistema de auditoría

2. **[02_ARCHITECTURE.md](docs/02_ARCHITECTURE.md)**
   - Arquitectura física y lógica
   - Diseño de API REST
   - Patrones arquitectónicos
   - Seguridad y autenticación
   - Infraestructura Docker

3. **[03_SISTEMA_LOTES_AUTOMATIZADO.md](docs/03_SISTEMA_LOTES_AUTOMATIZADO.md)**
   - Algoritmo FIFO detallado
   - Implementación en C#
   - Casos de uso y escenarios
   - Testing y validación
   - Motor core del sistema ⚙️

4. **[04_FLUJOS_NEGOCIO.md](docs/04_FLUJOS_NEGOCIO.md)**
   - Flujos de obrador
   - Flujos de repartidor
   - Procesos administrativos
   - Manejo de excepciones

5. **[05_MVP_Y_ROADMAP.md](docs/05_MVP_Y_ROADMAP.md)**
   - Roadmap completo (6.5 meses)
   - Fases de desarrollo
   - Estimaciones y recursos
   - Riesgos y mitigación

### Checklist de Progreso

Ver [check_list.md](check_list.md) para seguimiento detallado del proyecto.

---

## 🚀 Roadmap de Desarrollo

```
┌─────────────────────────────────────────────────────────────┐
│ FASE 0: Preparación (2 semanas)                             │
│ - Infraestructura                                           │
│ - Repositorio y CI/CD                                       │
│ - Base de datos                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FASE 1: MVP Backend (4 semanas)                             │
│ - API REST completa                                         │
│ - Motor de asignación de lotes                              │
│ - Autenticación                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FASE 2: MVP Frontend Obrador (4 semanas)                    │
│ - Cliente WPF                                               │
│ - Módulos core                                              │
│ - UX optimizada                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FASE 3: Validación (2 semanas)                              │
│ - Piloto con usuarios reales                                │
│ - Feedback y ajustes                                        │
│ - Go-live                                                   │
└─────────────────────────────────────────────────────────────┘

        ▼ MVP COMPLETADO (3 meses) ▼

┌─────────────────────────────────────────────────────────────┐
│ FASE 4-7: Funcionalidades Avanzadas (3.5 meses)             │
│ - Pedidos y albaranes                                       │
│ - Módulo repartidor                                         │
│ - Optimizaciones                                            │
│ - Integraciones                                             │
└─────────────────────────────────────────────────────────────┘

        ▼ SISTEMA COMPLETO (6.5 meses) ▼
```

---

## 💡 Valor del Sistema

### ROI Esperado

- **Ahorro de tiempo:** 60% reducción en tiempo de facturación
- **Reducción de errores:** 100% en asignación de lotes
- **Escalabilidad:** Sin costos adicionales de personal
- **Compliance:** Trazabilidad legal completa
- **ROI positivo:** A los 12 meses de uso

### Ventajas Competitivas

✅ **No es SaaS genérico:** Sistema diseñado específicamente para este negocio  
✅ **Propiedad total:** No dependencia de terceros, sin cuotas mensuales  
✅ **Automatización real:** No solo digitalización, verdadera automatización  
✅ **Escalable:** Preparado para crecimiento (múltiples obradores, repartidores)  
✅ **Customizable:** Adaptable a necesidades futuras  

---

## 🔧 Instalación y Despliegue

### Requisitos Mínimos

**Servidor:**
- CPU: 4 cores @ 2.5 GHz
- RAM: 16 GB
- Disco: 256 GB SSD
- OS: Ubuntu Server 22.04 LTS

**Clientes:**
- Windows 10/11 Pro
- RAM: 8 GB
- .NET Runtime 8.0

### Instalación Rápida (Futuro)

```bash
# Clonar repositorio
git clone https://github.com/buenatierra/sistema.git
cd sistema

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Desplegar con Docker
docker-compose up -d

# Crear base de datos
docker exec -it buenatierra-db psql -U postgres -f /scripts/init.sql

# La API estará disponible en https://tu-servidor:5001
```

---

## 🧪 Testing

```bash
# Tests unitarios
dotnet test tests/BuenaTierra.UnitTests

# Tests de integración
dotnet test tests/BuenaTierra.IntegrationTests

# Cobertura de tests
dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura
```

---

## 📊 Métricas y KPIs

### Objetivos MVP

| Métrica | Objetivo | Estado |
|---------|----------|--------|
| Tiempo de facturación | < 2 minutos | 🟡 Pendiente validar |
| Errores en asignación | 0% | 🟡 Pendiente validar |
| Uptime del sistema | > 99% | 🟡 Pendiente medir |
| Satisfacción usuario | > 8/10 | 🟡 Pendiente validar |

---

## 👥 Equipo y Contacto

**Product Owner:** [Nombre]  
**Tech Lead:** [Nombre]  
**Backend Developer:** [Nombre]  
**Frontend Developer:** [Nombre]  
**DevOps:** [Nombre]  

---

## 📜 Licencia

Este proyecto es **privado** y propietario. Todos los derechos reservados.

---

## 🗺️ Estado Actual del Proyecto

### ✅ Completado (Fase de Diseño)

- [x] Análisis de requisitos
- [x] Diseño de base de datos profesional
- [x] Arquitectura del sistema definida
- [x] Diseño de motor de automatización de lotes
- [x] Documentación de flujos de negocio
- [x] Roadmap y planificación completa

### 🔄 En Progreso

- [ ] Fase 0: Preparación de infraestructura (inicio pendiente)

### ⏳ Pendiente

- [ ] Fase 1: Desarrollo MVP Backend
- [ ] Fase 2: Desarrollo MVP Frontend
- [ ] Fase 3: Validación y ajustes
- [ ] Fases 4-7: Funcionalidades avanzadas

---

## 📞 Soporte

Para consultas técnicas o reportar issues, contactar a:
- Email: [email]
- Teams/Slack: [canal]

---

**Última actualización:** 2026-02-20  
**Versión del documento:** 1.0  
**Estado:** Diseño completado, listo para iniciar desarrollo ✅

---

## 🎖️ Reconocimientos

Este sistema ha sido diseñado con enfoque en:
- Arquitectura empresarial profesional
- Automatización real de procesos
- Escalabilidad y mantenibilidad
- Compliance regulatorio (trazabilidad alimentaria)
- UX optimizada para velocidad operativa

Diseñado con metodología **Clean Architecture** y mejores prácticas de la industria.
