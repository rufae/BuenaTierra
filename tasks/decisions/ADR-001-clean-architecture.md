# ADR-001 — Clean Architecture como patrón estructural del backend

**Estado:** ACEPTADO  
**Fecha:** 2025 (sesión de diseño inicial)  
**Decididores:** Equipo de diseño / AI architect  

---

## Contexto

El backend de BuenaTierra requiere separar la lógica de negocio (lotes, trazabilidad, facturación) de los detalles de infraestructura (PostgreSQL, QuestPDF, EF Core) para poder evolucionar cada capa de forma independiente y mantener testabilidad.

## Opciones consideradas

1. **Arquitectura en capas tradicional (3-tier)** — Controller → Service → Repository. Simple pero acoplada.
2. **Clean Architecture (Uncle Bob)** — Domain / Application / Infrastructure / API. Más compleja, mayor abstracción.
3. **Arquitectura Vertical Slices** — Feature folders. Mínimo cruce de capas, pero sin separación de dominio clara.

## Decisión

**Opción 2 — Clean Architecture** con 4 proyectos en la solución:

- `BuenaTierra.Domain` — Entidades puras, sin dependencias externas
- `BuenaTierra.Application` — Casos de uso, interfaces, DTOs, servicios de aplicación
- `BuenaTierra.Infrastructure` — EF Core, PostgreSQL, QuestPDF, EPPlus, implementaciones concretas
- `BuenaTierra.API` — Controllers ASP.NET Core, configuración, middleware

## Consecuencias

**Positivas:**
- Lógica de negocio testable sin base de datos (`BuenaTierra.Tests` con 23 tests xUnit)
- Infraestructura intercambiable (PostgreSQL → otro motor sin tocar Domain/Application)
- Separación clara de responsabilidades para el agente AI (sabe exactamente dónde va cada cosa)

**Negativas:**
- Mayor número de proyectos y archivos
- DTOs y mapeos adicionales en cada capa
- Curva de aprendizaje para desarrolladores nuevos
