# CHECKLIST OPERATIVO - BUENATIERRA

> Ultima actualizacion: 24 Marzo 2026  
> Alcance: solo tareas pendientes, incompletas o en revision.  
> Criterio: se elimina del checklist todo lo ya entregado y estable.

---

## P1 - Critico para produccion real

- [ ] Unificar y redisenar la logica comercial de descuentos por cliente.
- [ ] Definir precedencia oficial de precio y descuento: precio manual de linea > condicion especial por cliente > precio base producto; descuento manual de linea > condicion especial por cliente > descuento general cliente > descuento por defecto producto.
- [x] Aplicar condiciones especiales de cliente en facturas.
- [x] Aplicar condiciones especiales de cliente en albaranes creados manualmente.
- [x] Revisar si la conversion pedido -> albaran -> factura preserva correctamente precios, descuentos, RE y retenciones sin recalculo inconsistente.
- [x] Soportar condiciones especiales globales para todos los productos de un cliente.
- [x] Soportar condiciones especiales por producto concreto usando codigo/referencia de producto de forma robusta.
- [ ] Revisar si se necesita soporte por familia de articulo en condiciones especiales y cerrar esa logica extremo a extremo.
- [x] Anular facturas con reversion real de stock, movimientos y trazabilidad cuando corresponda.
- [ ] Definir criterio legal/contable de anulacion: cambio de estado, factura rectificativa futura, o reversion operativa interna con auditoria.
- [ ] Desactivar seeds de usuarios/credenciales por defecto en produccion para evitar riesgo operativo y de seguridad.
- [x] Revisar cancelacion de albaranes para asegurar que la devolucion de stock solo ocurre si previamente hubo consumo real.
- [ ] Auditar el flujo de produccion en cliente para eliminar fallos intermitentes al finalizar produccion.
- [x] Corregir en instalaciones cliente cualquier constraint o funcion SQL desalineada respecto a enums y valores del dominio.
- [x] Corregir la funcion SQL `entrada_stock_produccion` en [database/init/01_schema.sql](database/init/01_schema.sql) para que compare `Finalizada` y no `finalizada`.
- [x] Crear script de verificacion post-instalacion que compare schema real del cliente contra [database/init/01_schema.sql](database/init/01_schema.sql).
- [x] Crear script de upgrade incremental para clientes ya instalados, evitando arreglos manuales ad hoc en pgAdmin.

## P1 - Estado tecnico del proyecto

- [x] Corregir errores TypeScript actuales del frontend para volver a tener build verde.
- [x] Corregir import erroneo `Produto` -> `Producto` en [frontend/src/pages/Produccion.tsx](frontend/src/pages/Produccion.tsx).
- [x] Corregir el tipado inseguro del ordenado en [frontend/src/pages/Clientes.tsx](frontend/src/pages/Clientes.tsx).
- [x] Corregir props no validas en iconos Lucide en [frontend/src/pages/Ingredientes.tsx](frontend/src/pages/Ingredientes.tsx).
- [x] Eliminar imports/tipos no usados detectados por TypeScript en [frontend/src/pages/Productos.tsx](frontend/src/pages/Productos.tsx).
- [x] Revisar y corregir el tipo frontend `EstadoProduccion = 'EnCurso'` para alinearlo con backend/schema `EnProceso` en [frontend/src/types/index.ts](frontend/src/types/index.ts).
- [x] Actualizar dependencias vulnerables, especialmente `AutoMapper 16.0.0` con advisory de severidad alta.

## P2 - Funcionalidad negocio incompleta o mal cerrada

- [ ] Revisar el modelo de recargo de equivalencia para que la UX sea coherente con el negocio.
- [ ] Confirmar si el cliente necesita solo checkbox de RE por cliente o tambien configuracion editable de tabla IVA -> RE por empresa.
- [ ] Si el porcentaje RE depende de la tabla general, no mostrar campos ambiguos de porcentaje en formularios donde el usuario espere editarlo a nivel cliente.
- [ ] Revisar y documentar relacion entre `TipoImpuesto = RecargoEquivalencia` y `RecargoEquivalencia = true` para evitar doble fuente de verdad.
- [ ] Revisar relacion entre `Activo` y `EstadoCliente` en cliente; actualmente son dos fuentes de estado potencialmente inconsistentes.
- [ ] Revisar relacion entre `NoAplicarRetenciones` y `% Retencion` para evitar formularios contradictorios.
- [ ] Revisar si `TarifaId` debe existir realmente o eliminarlo del modelo/UI hasta que haya modulo de tarifas.
- [x] Implementar consumo real de ingredientes en produccion (FIFO en control de materias primas y bloqueo por falta de stock).
- [x] Implementar export Excel de albaranes.
- [x] Incluir detalle del pedido/documento en los Excel de factura y/o albaran, no solo cabecera de cliente.
- [x] Definir un formato de Excel operativo para cliente y sanidad: cabecera, lineas, lotes, descuentos, IVA, RE, retencion, trazabilidad y referencias de documento origen.
- [x] Revisar PDF/Excel de factura para mostrar claramente descuentos aplicados y origen del descuento.
- [x] Revisar si facturacion rapida repartidor aplica la misma logica fiscal/comercial que la facturacion normal.
- [x] Revisar si los pedidos usan correctamente tabla `tipos_iva_re` en vez de fallback hardcodeado.
- [x] Eliminar o encapsular fallbacks hardcodeados de RE cuando exista configuracion por empresa.

## P2 - BuenaTierrAI (IA integrada)

- [x] Crear modulo BuenaTierrAI con jerarquia separada de rol, contexto, guardrails, perfil de modelo y herramientas API.
- [x] Exponer endpoints seguros de IA (`/api/buenatierr-ai/status`, `/api/buenatierr-ai/chat`) protegidos por autenticacion.
- [x] Garantizar que BuenaTierrAI no accede directo a BD y solo opera con contexto inyectado por API.
- [x] Integrar apartado BuenaTierrAI en la app (ruta y menu) para Admin/Obrador/Repartidor.
- [x] Permitir configuracion de API key por entorno para instalacion cliente (.env o fichero local de clave en API).

## P2 - UX operativa y formularios

- [ ] Corregir inputs numericos que arrancan en `0` y producen entradas tipo `05` al editar.
- [ ] Estandarizar todos los inputs numericos para que vacio visual no implique `0` persistido hasta confirmar.
- [ ] Revisar formularios de clientes, pedidos, albaranes, facturas, produccion, ingredientes y ajustes para evitar placeholders/valores por defecto molestos.
- [ ] Revisar campos donde el usuario espera decimal libre y hoy se parsea con `parseInt`.
- [x] Revisar si `cantidadProducida` en produccion debe admitir decimal y no solo entero.
- [ ] Revisar si cantidades en pedidos/albaranes/facturas deben admitir tres decimales y si la UI lo refleja igual que la BD.
- [ ] Revisar UX de cliente para condiciones especiales: hoy se pueden crear, pero no hay indicacion clara de prioridad ni alcance.
- [ ] Mostrar al usuario, al facturar o crear albaran, que precio/descuento final ha sido aplicado y por que regla.
- [ ] Revisar textos de ayuda y mensajes operativos para evitar falsa sensacion de funcionalidad completa cuando solo existe parte del flujo.

## P2 - Coherencia modelo / EF / schema

- [ ] Mantener auditoria completa de entidades vs schema tras cada cambio relevante.
- [ ] Revisar todos los enums convertidos con `EnumToStringConverter` para asegurar compatibilidad con CHECK constraints y funciones SQL.
- [ ] Revisar funciones SQL que inserten strings literales en tablas controladas por enums C#.
- [ ] Revisar si procede anadir CHECK constraints faltantes para enums que hoy solo estan validados por la capa .NET.
- [ ] Revisar propiedades ignoradas por EF (`Subtotal`, `IvaImporte`, `RecargoEquivalenciaImporte`, `Total`) para asegurar que siempre existan como columnas generadas en BD cuando el dominio las asume.
- [ ] Revisar el `new UpdatedAt` de `Stock` en [src/BuenaTierra.Domain/Entities/Stock.cs](src/BuenaTierra.Domain/Entities/Stock.cs) y decidir si debe existir o eliminarse.
- [ ] Revisar si `IvaDesglose` y `DatosAdicionales` deben modelarse como objetos tipados y no como `string` JSON crudo.
- [ ] Revisar si la tabla `auditoria` esta integrada realmente en la aplicacion o solo existe en schema.
- [ ] Crear una comprobacion automatica de arranque o CI que detecte divergencias entre EF y schema antes de desplegar (script operativo listo, falta cablearlo a CI/arranque).

## P2 - Desktop y despliegue cliente

- [x] Consolidar proceso de instalacion de escritorio sin dependencia de Docker para cliente final.
- [x] Generar instalador definitivo con schema actualizado y comprobaciones de prerequisitos.
- [x] Definir checklist de despliegue en cliente: PostgreSQL, puertos, servicio API, instalador escritorio, prueba login, prueba cliente, prueba produccion, prueba factura.
- [x] Incorporar smoke test post-instalacion para detectar enseguida errores como login, crear cliente, finalizar produccion y crear factura.
- [x] Documentar ruta unica de logs a revisar en cliente y procedimiento de soporte remoto.
- [x] Paginacion en todos los endpoints de lista (Clientes, Productos, Facturas, Albaranes, Pedidos, Lotes).
- [x] Rate limiting: auth 10/min, general 200/min, reportes 30/min.
- [x] Guards de borrado en productos: bloquear si tiene stock activo o lineas en facturas.
- [x] CORS restrictivo en produccion via appsettings.Production.json.
- [x] Schema versionado con tabla schema_version y script idempotente 05_upgrade_v2_20260328.sql.
- [x] Auto-migracion al arrancar: la API aplica scripts pendientes automaticamente en cliente.
- [x] Health check real con verificacion de conectividad a la base de datos (200/503).
- [x] Documentar proceso completo de empaquetado EXE en realizacion_exe.md.

## P3 - Testing y calidad

- [ ] Volver a dejar `dotnet test` util como senal de calidad en entorno con Docker disponible.
- [ ] Asegurar ejecucion automatica de integration tests con Testcontainers en CI o documentar precondiciones locales.
- [ ] Anadir tests para descuentos por cliente y condiciones especiales.
- [ ] Anadir tests para anulacion de facturas y devolucion de stock.
- [ ] Anadir tests para anulacion/cancelacion de albaranes y comportamiento del stock.
- [ ] Anadir tests para RE y retenciones por combinacion de cliente + producto + documento.
- [ ] Anadir test especifico para produccion repetida mismo lote / mismo dia / merge de stock.
- [ ] Anadir test de compatibilidad schema-enums para `movimientos_stock` y demas tablas con valores restringidos.
- [ ] Completar tests E2E del flujo de trazabilidad y de exportes Excel.
- [ ] Ejecutar baseline de seguridad OWASP ZAP.

## P3 - Infraestructura y operacion

- [ ] Configurar backup automatico de PostgreSQL en produccion (script listo, pendiente alta en entorno final).
- [ ] Configurar monitorizacion basica y health checks reales de servicio/API/BD (script listo, pendiente despliegue programado).
- [ ] Cerrar configuracion de red, firewall y HTTPS para entorno cliente/produccion.
- [ ] Probar rollback documentado de version y de schema (script listo, falta prueba controlada en entorno cliente).

## P3 - Etiquetas e impresion

- [ ] Cerrar analisis funcional con el cliente sobre impresora Brother y software actual.
- [ ] Confirmar formato de plantillas y flujo real de impresion antes de continuar desarrollo.
- [ ] Decidir arquitectura final de impresion: driver local, servicio local o integracion nativa.
- [ ] Validar cumplimiento legal de lote y alergenos en etiqueta final.

## P4 - Integraciones y crecimiento

- [ ] Definir integracion contable futura.
- [ ] Definir exportaciones normalizadas para gestorias/AEAT.
- [ ] Evaluar arquitectura multi-tenant real si el producto va a comercializarse para varios obradores.
- [ ] Evaluar particionado historico de `movimientos_stock` cuando el volumen lo requiera.

## Observaciones de auditoria abierta

- [ ] Revisar periodicamente instalaciones de cliente ya desplegadas para detectar drift entre BD real y schema versionado.
- [ ] No considerar una funcionalidad cerrada solo porque exista UI; debe quedar validado el flujo completo backend + persistencia + exportacion + efectos en stock/trazabilidad.
- [ ] Mantener este checklist como backlog operativo vivo hasta cerrar P1 y P2.