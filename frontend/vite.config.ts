import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { InlineConfig } from 'vitest/node'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

/**
 * CONFIGURACIÓN DE PUERTOS PARA DESARROLLO
 * Backend: http://localhost:5001 (dotnet run)
 * Frontend: http://localhost:5173 (vite dev)
 * DB: localhost:5434 (docker postgres mapped from 5432)
 * Ver DEV_PORTS.md para referencia completa
 */
const apiTarget = process.env.VITE_API_URL ?? 'http://localhost:5001'

export default defineConfig({
  plugins: [react()],
  // base './' es imprescindible para que Electron cargue los assets
  // desde el sistema de ficheros local (file://)
  base: process.env.ELECTRON_BUILD ? './' : '/',
  build: {
    chunkSizeWarningLimit: 1000,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    port: 5173,
    strictPort: false, // Permite fallback a 5174, 5175... si puerto ocupado
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/wopi': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
