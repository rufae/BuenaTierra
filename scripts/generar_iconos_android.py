#!/usr/bin/env python3
"""
Convierte el icono ICO del EXE a PNG para todos los recursos launcher de Android:
- ic_launcher.png
- ic_launcher_round.png
- ic_launcher_foreground.png
"""
from PIL import Image
import os

# Definir resoluciones de Android
# - launcher/round: tamaño del icono final
# - foreground: tamaño recomendado para icono adaptativo
resolutions = {
    'mipmap-ldpi': {'launcher': 36, 'foreground': 81},
    'mipmap-mdpi': {'launcher': 48, 'foreground': 108},
    'mipmap-hdpi': {'launcher': 72, 'foreground': 162},
    'mipmap-xhdpi': {'launcher': 96, 'foreground': 216},
    'mipmap-xxhdpi': {'launcher': 144, 'foreground': 324},
    'mipmap-xxxhdpi': {'launcher': 192, 'foreground': 432},
}

# Abrir el icono ICO
ico_path = './buenatierra.ico'
img = Image.open(ico_path).convert('RGBA')
print(f"Icono original: {img.size}")

# Basepath de Android
android_base = './frontend/android/app/src/main/res'

# Generar iconos para cada resolución
for folder, sizes in resolutions.items():
    launcher_size = sizes['launcher']
    foreground_size = sizes['foreground']

    output_dir = os.path.join(android_base, folder)
    os.makedirs(output_dir, exist_ok=True)

    launcher = img.resize((launcher_size, launcher_size), Image.Resampling.LANCZOS)
    foreground = img.resize((foreground_size, foreground_size), Image.Resampling.LANCZOS)

    launcher_path = os.path.join(output_dir, 'ic_launcher.png')
    round_path = os.path.join(output_dir, 'ic_launcher_round.png')
    foreground_path = os.path.join(output_dir, 'ic_launcher_foreground.png')

    launcher.save(launcher_path, 'PNG')
    launcher.save(round_path, 'PNG')
    foreground.save(foreground_path, 'PNG')

    print(f"Generado: {launcher_path} ({launcher_size}x{launcher_size})")
    print(f"Generado: {round_path} ({launcher_size}x{launcher_size})")
    print(f"Generado: {foreground_path} ({foreground_size}x{foreground_size})")

print("✓ Iconos Android generados correctamente")
