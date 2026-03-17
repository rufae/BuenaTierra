"""
Genera los 14 archivos MP3 de narración para el vídeo explicativo de BuenaTierra.
Requiere: gTTS (pip install gtts)
Salida: docs/video_assets/s1_narracion.mp3 ... s14_narracion.mp3
"""

import os
from gtts import gTTS

ESCENAS = {
    "s1": (
        "BuenaTierra: un obrador artesanal con un nuevo modelo digital, "
        "más rápido, más eficiente y sin errores."
    ),
    "s2": (
        "Antes, gestionar lotes, albaranes y facturas era lento, manual y lleno de errores. "
        "Cada venta requería escribir a mano lote por lote."
    ),
    "s3": (
        "La nueva aplicación centraliza todo: clientes, productos, lotes, albaranes y facturas. "
        "Una sola pantalla, cero papel."
    ),
    "s4": (
        "El sistema tiene tres roles: Admin, Obrador y Repartidor. "
        "Cada uno accede solo a lo que necesita, con permisos diferenciados."
    ),
    "s5": (
        "Gestión completa de clientes: empresas, autónomos, particulares y repartidores. "
        "Todos centralizados, todos buscables en segundos."
    ),
    "s6": (
        "Cada día el obrador produce sus dulces. El sistema genera automáticamente "
        "un lote por producción diaria con fecha."
    ),
    "s7": (
        "Cada producto tiene sus ingredientes, alérgenos y precio configurados. "
        "El sistema avisa cuando el stock de materias primas es bajo."
    ),
    "s8": (
        "El sistema controla el stock por lote. Cuando se vende, "
        "asigna automáticamente el lote más antiguo primero. "
        "Sin escritura manual. Sin errores."
    ),
    "s9": (
        "El empleado recibe un pedido, crea el albarán en segundos. "
        "El sistema reparte los lotes automáticamente. "
        "Un clic convierte el albarán en factura."
    ),
    "s10": (
        "El repartidor es un empresario independiente. "
        "Compra al obrador, revende a sus clientes, "
        "y gestiona sus propias facturas."
    ),
    "s11": (
        "Base de datos centralizada online. "
        "Cualquier usuario accede en tiempo real desde cualquier dispositivo. "
        "Datos siempre sincronizados."
    ),
    "s12": (
        "Todo queda registrado. En cualquier momento se puede saber "
        "qué se produjo, en qué lote, a quién se vendió."
    ),
    "s13": (
        "Exporta a Excel todos los datos de trazabilidad: lotes, fechas de caducidad, "
        "productos vendidos y clientes. Listo para Sanidad en un clic."
    ),
    "s14": (
        "BuenaTierra. Más rápido, más limpio, más rentable. "
        "El obrador del futuro, hoy."
    ),
}

SALIDA = os.path.join(os.path.dirname(__file__), "..", "docs", "video_assets")


def generar():
    os.makedirs(SALIDA, exist_ok=True)
    for clave, texto in ESCENAS.items():
        ruta = os.path.join(SALIDA, f"{clave}_narracion.mp3")
        print(f"Generando {clave}...")
        gTTS(text=texto, lang="es", tld="es").save(ruta)
        print(f"  -> {ruta}")
    print(f"\nListo. {len(ESCENAS)} archivos en {os.path.abspath(SALIDA)}")


if __name__ == "__main__":
    generar()
