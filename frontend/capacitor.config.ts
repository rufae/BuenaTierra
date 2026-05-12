import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.buenatierra.app',
  appName: 'BuenaTierra',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
