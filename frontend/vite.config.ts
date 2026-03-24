import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // base './' es imprescindible para que Electron cargue los assets
  // desde el sistema de ficheros local (file://)
  base: process.env.ELECTRON_BUILD ? './' : '/',
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/wopi': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
