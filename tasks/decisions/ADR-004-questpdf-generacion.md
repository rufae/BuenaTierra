# ADR-004 — QuestPDF para generación de documentos PDF

**Estado:** ACEPTADO  
**Fecha:** 2025 (sesión de facturación PDF)  
**Decididores:** AI architect  

---

## Contexto

El sistema necesita generar PDFs de albaranes y facturas con diseño estructurado, incluyendo cabecera de empresa, líneas de detalle con lotes, totales (base imponible, IVA, RE, retención), y pie con datos fiscales. Los PDFs deben poder descargarse desde la API y también imprimirse directamente desde la app del repartidor.

## Opciones consideradas

1. **iTextSharp / iText7** — Potente pero licencia AGPL restrictiva para uso comercial. Licencia comercial cara.
2. **PdfSharp + MigraDoc** — Open source pero API de bajo nivel, verboso para diseños complejos.
3. **QuestPDF** — Fluent API, open source (MIT para proyectos <1M USD/año), diseño declarativo tipo layout.
4. **Razor → HTML → wkhtmltopdf** — Flexible pero dependencia externa binaria, problemas en Docker.
5. **FastReport / RDLC** — Orientados a reporting, no a documentos de facturación dinámica.

## Decisión

**QuestPDF** implementado en `BuenaTierra.Infrastructure.Services` (FacturaService, AlbaranService).

## Consecuencias

**Positivas:**
- API fluent y declarativa: layouts complejos con pocas líneas
- Sin dependencias externas en Docker (puro .NET)
- Soporte para PDF/A (archivo legal) — mejora futura posible (ver `backlog.md` NEW-05)
- Renderizado en memoria → stream directo en respuesta HTTP (sin archivos temporales)
- Condicionales en PDF (RE, retención) implementados con `.ShowIf(condition)`

**Negativas:**
- Licencia requiere revisión si el proyecto supera 1M USD de ingresos anuales (escenario SaaS futuro)
- No tiene diseñador visual — el layout se define 100% en código C#
- Cambios de diseño del PDF requieren modificar código, no plantillas externas
