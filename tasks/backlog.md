# BACKLOG — BUENATIERRA

> Ítems pendientes sin sprint asignado.
> Migrados desde `check_list.md` (ítems sin marcar) + nuevas propuestas.
> Clasificados por: Área / Prioridad (P1-P4) / Esfuerzo estimado (S/M/L/XL).

**P1** = Bloquea producción o cumplimiento legal  
**P2** = Mejora operativa significativa  
**P3** = Mejora técnica o deuda controlada  
**P4** = Futuro / especulativo

---

## INFRAESTRUCTURA & DESPLIEGUE

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| INF-01 | Configuración de red y firewall en producción | P1 | M | Prerequisito para despliegue real |
| INF-02 | Sistema de backup automático PostgreSQL | P1 | M | pg_dump + cron o pgBackRest |
| INF-03 | Monitorización básica (uptime + alertas) | P2 | S | Uptime Kuma o similar |
| INF-04 | Instalación en servidor de producción | P1 | L | Seguir `docs/DESPLIEGUE_PRODUCCION.md` |
| INF-05 | Pruebas en producción (smoke tests) | P1 | M | Post-despliegue |
| INF-06 | Plan de rollback documentado | P1 | S | Procedimiento formal |
| INF-07 | Particionado de tablas históricas (movimientos_stock, lineas) | P3 | L | Cuando >1M filas |
| INF-08 | Replicación de base de datos (read replica) | P4 | XL | Multi-repartidor escenario |

---

## TESTING

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| TST-01 | Tests de integración con BD real (WebApplicationFactory) | P2 | L | Cubrir endpoints críticos: facturas, lotes, trazabilidad |
| TST-02 | Tests e2e con Playwright | P3 | XL | Flujo completo: crear cliente → albaran → factura |
| TST-03 | Tests de carga con k6 | P3 | M | Escenario: 10 repartidores concurrentes |
| TST-04 | Tests de seguridad OWASP ZAP baseline | P2 | M | Autenticación + endpoints admin |

---

## DOCUMENTACIÓN

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| DOC-01 | Manual de mantenimiento (ops) | P2 | M | Backups, logs, actualizaciones |
| DOC-02 | Procedimientos de actualización del sistema | P2 | S | Checklist de upgrade |

---

## FORMACIÓN & SOPORTE

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| FOR-01 | Formación usuarios de oficina (obrador) | P1 | M | Presencial + manual-obrador.md |
| FOR-02 | Formación repartidores | P1 | M | POS flujo completo |
| FOR-03 | Material de soporte (FAQ, vídeos cortos) | P2 | L | |
| FOR-04 | Sistema de tickets/soporte (canal) | P2 | S | Email, WhatsApp o Freshdesk básico |
| FOR-05 | Plan de mantenimiento continuo | P2 | M | SLA, ventanas de mantenimiento |

---

## UX & PRODUCTO

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| UX-01 | Modo offline parcial para repartidor | P3 | XL | Service Worker + sync queue |

---

## ESCALABILIDAD & MULTI-EMPRESA

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| ESC-01 | Diseño para múltiples obradores (multi-tenant) | P4 | XL | Requiere re-arquitectura de datos |
| ESC-02 | Diseño para múltiples repartidores por obrador | P3 | M | Modular ya, revisar permisos |
| ESC-03 | Sistema de configuración multi-empresa | P4 | XL | Dependiente de ESC-01 |

---

## INTEGRACIONES EXTERNAS

| ID | Ítem | Prioridad | Esfuerzo | Notas |
|----|------|-----------|----------|-------|
| INT-01 | Preparación para integración contable (FacturaE / A3) | P3 | L | Definir formato de salida |
| INT-02 | Preparación para SII (AEAT) — declaración IVA online | P2 | XL | Requiere certificado digital + módulo |
| INT-03 | API pública para integraciones externas (OAuth2 / API key) | P3 | L | Documentar con OpenAPI 3.1 |
| INT-04 | Exportación a formatos estándar (XML EDICOM, CSV AEAT) | P3 | M | |

---

## PROPUESTAS NUEVAS (no en check_list.md original)

| ID | Ítem | Prioridad | Esfuerzo | Origen |
|----|------|-----------|----------|--------|
| NEW-01 | CI/CD pipeline (GitHub Actions: build + test + docker push) | P2 | M | Governance session |
| NEW-02 | Health check endpoint + dashboard de estado del sistema | P2 | S | `/api/health` ya en .NET, exponer en UI |
| NEW-03 | Auditoría de accesos en base de datos (tabla `audit_log`) | P2 | M | Trazabilidad legal + seguridad |
| NEW-04 | Notificaciones de stock bajo (umbral configurable) | P3 | S | Dashboard ya existe, añadir alerta |
| NEW-05 | Exportación factura en formato PDF/A para archivo legal | P3 | S | QuestPDF soporta PDF/A |
