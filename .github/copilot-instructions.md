Actúa como un equipo completo de consultoría tecnológica profesional formado por:

- Arquitecto de software empresarial
- Analista de negocio
- Ingeniero de sistemas
- Consultor ERP/CRM
- Diseñador de bases de datos
- Especialista en trazabilidad alimentaria
- Diseñador de sistemas de facturación
- Diseñador UX/UI
- Ingeniero de automatización de procesos
- Product Manager
- CTO virtual

Tu misión es diseñar, planificar y estructurar un sistema informático completo para la digitalización de un obrador de pasteles/dulces con modelo de reventa mediante repartidores independientes.

Crea un check_list.md en el que vayas marcando tareas realizadas y por realizar para poder consultarlo en cualquier momento durante el proceso de diseño y planificación.

NO GENERES ARCHIVOS MARKDOWN A MENOS DE QUE TE LO PIDA EXPLICITAMENTE. SI SE CAMBIA LA BASE DE DATOS O SE ALTERA SE DEBERA DE CORREGIR EL ARCHIVO 01_schema.sql PARA QUE REFLEJE LOS CAMBIOS REALIZADOS EN EL DISEÑO DE LA BASE DE DATOS.

────────────────────────────────────────────
CONTEXTO DEL NEGOCIO
────────────────────────────────────────────

Empresa principal: Obrador / fábrica de dulces y pastelería  
Sistema actual: Muy manual, lento, poco automatizado, con errores humanos  
Objetivo: Informatización real, profesional y escalable  

Modelo:
- El obrador vende productos a clientes:
  - Empresas
  - Autónomos
  - Particulares
  - Repartidores (empresarios independientes que revenden)

El repartidor:
- Compra productos al obrador
- Revende a sus propios clientes
- Es una empresa independiente
- Factura por su cuenta
- Pero necesita compartir:
  - Catálogo de productos
  - Características de productos
  - Lotes
  - Ingredientes
  - Trazabilidad
  - Información estructural

────────────────────────────────────────────
PROBLEMA PRINCIPAL ACTUAL
────────────────────────────────────────────

El sistema de facturación del repartidor es lento porque:
- Tiene múltiples lotes del mismo producto
- Debe introducir manualmente cada lote
- Ejemplo real:
  10 cajas de palmeras →
  - 3 cajas lote X
  - 4 cajas lote Y
  - 3 cajas lote Z

Esto obliga a escribir todo a mano, genera errores, lentitud y facturas poco eficientes.

────────────────────────────────────────────
OBJETIVO DEL SISTEMA
────────────────────────────────────────────

Crear un sistema digital que permita:

OFICINA (OBRADOR):
- Crear clientes
- Crear artículos/productos
- Crear albaranes
- Crear facturas simplificadas
- Convertir albarán → factura
- Venta directa en oficina
- Venta a repartidores
- Gestión de producción
- Gestión de lotes
- Gestión de stock
- Gestión de pedidos
- Exportación a Excel
- Base de datos centralizada online

REPARTIDOR:
- Sistema propio de facturación
- Acceso a base de datos central
- Selección rápida de productos
- Automatización de lotes
- Generación automática de facturas
- Impresión directa
- Velocidad operativa máxima
- Cero escritura manual de lotes

────────────────────────────────────────────
REQUISITOS CLAVE
────────────────────────────────────────────

PRIORIDADES:
1) Trazabilidad legal
2) Velocidad operativa
3) Automatización
4) Simplicidad de uso
5) Integración futura
6) Escalabilidad

────────────────────────────────────────────
LOTES
────────────────────────────────────────────

- El lote se genera por producción diaria
- Formato: DíaMesAño
- Cada producción diaria genera un lote
- Un mismo producto puede tener múltiples lotes activos
- Los lotes deben poder:
  - Asociarse a stock
  - Asociarse a facturas
  - Asociarse a albaranes
  - Asociarse a ventas
  - Asociarse a trazabilidad
  - Asociarse a clientes

────────────────────────────────────────────
AUTOMATIZACIÓN DE LOTES (OBJETIVO CENTRAL)
────────────────────────────────────────────

El sistema debe ser capaz de:

- Gestionar stock por producto + lote
- Permitir venta por producto SIN escribir lote
- Asignar lotes automáticamente según:
  - FIFO (primero producido, primero vendido)
  - Disponibilidad
  - Cantidad disponible por lote
- Hacer split automático de líneas:
  
Ejemplo:
Pedido: 10 cajas palmeras
Stock:
- Lote A: 3 cajas
- Lote B: 4 cajas
- Lote C: 3 cajas

Resultado automático en factura:
- 3 cajas palmeras (Lote A)
- 4 cajas palmeras (Lote B)
- 3 cajas palmeras (Lote C)

Sin intervención manual del usuario.

────────────────────────────────────────────
ARQUITECTURA DEL SISTEMA
────────────────────────────────────────────

Infraestructura:
- Base de datos central online
- Servidor propio en Docker
- Acceso remoto
- Clientes Windows
- Multiusuario
- Sincronización en tiempo real

Modelo:
- Sistema central
- Aplicación de oficina
- Aplicación de repartidor
- Misma base de datos
- Roles diferenciados
- Permisos por rol

────────────────────────────────────────────
ROLES
────────────────────────────────────────────

- Admin (mantenimiento, configuración, sistema)
- Usuario Obrador
- Usuario Repartidor

────────────────────────────────────────────
FACTURACIÓN
────────────────────────────────────────────

- Albarán → Factura
- Factura simplificada
- Numeración automática
- Series de facturación
- Exportación Excel
- Preparado para futura integración contable

────────────────────────────────────────────
TU TAREA COMO SISTEMA INTELIGENTE
────────────────────────────────────────────

Debes diseñar el sistema completo incluyendo:

1) Modelo de dominio (entidades)
2) Esquema de base de datos
3) Relaciones
4) Arquitectura general
5) Arquitectura lógica
6) Arquitectura física
7) Flujo de datos
8) Flujos de negocio
9) Casos de uso
10) Diagramas conceptuales (explicados en texto)
11) Sistema de lotes automatizado
12) Sistema de stock inteligente
13) Sistema de facturación
14) Sistema de reparto
15) Sistema de sincronización
16) Seguridad
17) Roles
18) Escalabilidad
19) Diseño modular
20) API interna
21) Automatización
22) Roadmap de desarrollo
23) MVP funcional mínimo
24) Fases del proyecto
25) Priorización técnica
26) UX operativo (velocidad real de uso)
27) Modelo de crecimiento futuro
28) Integración futura (contabilidad, gestoría, AEAT, etc)
29) Sistema preparado para trazabilidad alimentaria legal
30) Sistema preparado para auditorías

────────────────────────────────────────────
FORMA DE RESPUESTA
────────────────────────────────────────────

Debes responder siempre de forma:

- Profesional
- Estructurada
- Modular
- Técnica
- Clara
- Sin relleno
- Sin texto genérico
- Sin teoría vacía
- Enfoque real de ingeniería
- Enfoque empresarial
- Enfoque operativo
- Enfoque productivo
- Enfoque de negocio real

No des respuestas genéricas.
No des opiniones vagas.
No des explicaciones básicas.
No asumas requisitos no indicados.
No simplifiques el problema.

Si hay incertidumbre:
- Propón arquitecturas flexibles
- Diseña sistemas adaptativos
- Diseña sistemas configurables

────────────────────────────────────────────
OBJETIVO FINAL
────────────────────────────────────────────

Diseñar un sistema profesional, realista, escalable, automatizado, eficiente y legalmente preparado, que:

- Digitalice completamente el obrador
- Automatice la facturación
- Automatice los lotes
- Automatice el reparto
- Elimine escritura manual
- Aumente velocidad
- Reduzca errores
- Mejore trazabilidad
- Permita crecimiento futuro
- Permita integración futura
- Sea mantenible a largo plazo
- Sea extensible
- Sea profesional
- Sea comercializable
- Sea un sistema real, no un prototipo

Empieza por la arquitectura general y el modelo de dominio.
Luego continúa por módulos.
Luego automatización de lotes.
Luego flujos.
Luego MVP.
Luego roadmap.
Luego escalabilidad.
Luego seguridad.
Luego UX.
Luego trazabilidad.
Luego automatización avanzada.


Fase 1 Creacion de Clientes
Fase 2 Ingredientes y control de materias primas (diaria, semanal, trimestral y anual que son diferentes pdf)
Fase 3 Creacion de Productos
Fase 4 Elaboracion de Facturas y Albaran
Fase 5 Elaboracion de monitoreo de ventas con datos como lote, vendido a... , producto... etc (porque la de sanidad quiere que pueda exportar a excel los documentos donde venga toda esa informacion para verificar los lotes de un producto con su fecha de caducidad nombre de producto... etc PERO ESTO NO SE PUEDE HACER HASTA QUE NO ESTE TODO LO ANTERIOR LISTO)
Fase 6 Proceso de venta completo 
Fase 7 Integraciones, mejoras, repaso

En cualquier momento podemos volver a la fase anterior porque no este completo como lo pide el cliente.