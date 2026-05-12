# CHECKLIST OPERATIVO - BUENATIERRA

> Ultima actualizacion: 08 Mayo 2026  
> Alcance: solo tareas pendientes, incompletas o en revision.  
> Criterio: se elimina del checklist todo lo ya entregado y estable.

---
## PRIORIDAD (lista ordenada)

1. [COMPLETADA 22-04-2026] Unificar y redisenar la logica comercial de descuentos por cliente.
2. [COMPLETADA 22-04-2026] Definir precedencia oficial de precio y descuento: precio manual de linea > condicion especial por cliente > precio base producto; descuento manual de linea > condicion especial por cliente > descuento general cliente > descuento por defecto producto.
3. [COMPLETADA 22-04-2026] Revisar si se necesita soporte por familia de articulo en condiciones especiales y cerrar esa logica extremo a extremo.
4. [COMPLETADA 08-05-2026] Implementar modulo de preventa completo (API + UI + validacion + conversion con confirmacion previa).
5. Definir criterio legal/contable de anulacion: cambio de estado, factura rectificativa futura, o reversion operativa interna con auditoria.
6. Desactivar seeds de usuarios/credenciales por defecto en produccion para evitar riesgo operativo y de seguridad.
6. Auditar el flujo de produccion en cliente para eliminar fallos intermitentes al finalizar produccion.
7. Mantener auditoria completa de entidades vs schema tras cada cambio relevante.
8. Revisar todos los enums convertidos con `EnumToStringConverter` para asegurar compatibilidad con CHECK constraints y funciones SQL.
9. Revisar funciones SQL que inserten strings literales en tablas controladas por enums C#.
10. Revisar si procede anadir CHECK constraints faltantes para enums que hoy solo estan validados por la capa .NET.
11. Revisar propiedades ignoradas por EF (`Subtotal`, `IvaImporte`, `RecargoEquivalenciaImporte`, `Total`) para asegurar que siempre existan como columnas generadas en BD cuando el dominio las asume.
12. Revisar el `new UpdatedAt` de `Stock` en [src/BuenaTierra.Domain/Entities/Stock.cs](src/BuenaTierra.Domain/Entities/Stock.cs) y decidir si debe existir o eliminarse.
13. Revisar si `IvaDesglose` y `DatosAdicionales` deben modelarse como objetos tipados y no como `string` JSON crudo.
14. Revisar si la tabla `auditoria` esta integrada realmente en la aplicacion o solo existe en schema.
15. Crear una comprobacion automatica de arranque o CI que detecte divergencias entre EF y schema antes de desplegar (script operativo listo, falta cablearlo a CI/arranque).
16. Corregir inputs numericos que arrancan en `0` y producen entradas tipo `05` al editar.
17. Estandarizar todos los inputs numericos para que vacio visual no implique `0` persistido hasta confirmar.
18. Revisar formularios de clientes, pedidos, albaranes, facturas, produccion, ingredientes y ajustes para evitar placeholders/valores por defecto molestos.
19. Revisar campos donde el usuario espera decimal libre y hoy se parsea con `parseInt`.
20. Revisar si cantidades en pedidos/albaranes/facturas deben admitir tres decimales y si la UI lo refleja igual que la BD.
21. Revisar UX de cliente para condiciones especiales: hoy se pueden crear, pero no hay indicacion clara de prioridad ni alcance.
22. Mostrar al usuario, al facturar o crear albaran, que precio/descuento final ha sido aplicado y por que regla.
23. Revisar textos de ayuda y mensajes operativos para evitar falsa sensacion de funcionalidad completa cuando solo existe parte del flujo.
24. Revisar el modelo de recargo de equivalencia para que la UX sea coherente con el negocio.
25. Confirmar si el cliente necesita solo checkbox de RE por cliente o tambien configuracion editable de tabla IVA -> RE por empresa.
26. Si el porcentaje RE depende de la tabla general, no mostrar campos ambiguos de porcentaje en formularios donde el usuario espere editarlo a nivel cliente.
27. Revisar y documentar relacion entre `TipoImpuesto = RecargoEquivalencia` y `RecargoEquivalencia = true` para evitar doble fuente de verdad.
28. Revisar relacion entre `Activo` y `EstadoCliente` en cliente; actualmente son dos fuentes de estado potencialmente inconsistentes.
29. Revisar relacion entre `NoAplicarRetenciones` y `% Retencion` para evitar formularios contradictorios.
30. Revisar si `TarifaId` debe existir realmente o eliminarlo del modelo/UI hasta que haya modulo de tarifas.
31. Volver a dejar `dotnet test` util como senal de calidad en entorno con Docker disponible.
32. Asegurar ejecucion automatica de integration tests con Testcontainers en CI o documentar precondiciones locales.
33. Anadir tests para descuentos por cliente y condiciones especiales.
34. Anadir tests para anulacion de facturas y devolucion de stock.
35. Anadir tests para anulacion/cancelacion de albaranes y comportamiento del stock.
36. Anadir tests para RE y retenciones por combinacion de cliente + producto + documento.
37. Anadir test especifico para produccion repetida mismo lote / mismo dia / merge de stock.
38. Anadir test de compatibilidad schema-enums para `movimientos_stock` y demas tablas con valores restringidos.
39. Completar tests E2E del flujo de trazabilidad y de exportes Excel.
40. Ejecutar baseline de seguridad OWASP ZAP.
41. Configurar backup automatico de PostgreSQL en produccion (script listo, pendiente alta en entorno final).
42. Configurar monitorizacion basica y health checks reales de servicio/API/BD (script listo, pendiente despliegue programado).
43. Cerrar configuracion de red, firewall y HTTPS para entorno cliente/produccion.
44. Probar rollback documentado de version y de schema (script listo, falta prueba controlada en entorno cliente).
45. Cerrar analisis funcional con el cliente sobre impresora Brother y software actual.
46. Confirmar formato de plantillas y flujo real de impresion antes de continuar desarrollo.
47. Decidir arquitectura final de impresion: driver local, servicio local o integracion nativa.
48. Validar cumplimiento legal de lote y alergenos en etiqueta final.
49. Definir integracion contable futura.
50. Definir exportaciones normalizadas para gestorias/AEAT.
51. Evaluar arquitectura multi-tenant real si el producto va a comercializarse para varios obradores.
52. Evaluar particionado historico de `movimientos_stock` cuando el volumen lo requiera.
53. Revisar periodicamente instalaciones de cliente ya desplegadas para detectar drift entre BD real y schema versionado.
54. No considerar una funcionalidad cerrada solo porque exista UI; debe quedar validado el flujo completo backend + persistencia + exportacion + efectos en stock/trazabilidad.
55. Mantener este checklist como backlog operativo vivo hasta cerrar P1 y P2.
