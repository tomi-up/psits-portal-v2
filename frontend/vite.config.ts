import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  // HTTPS (self-signed) is required for camera access (getUserMedia) on any
  // origin other than localhost - needed when officers open the scanner from
  // their own phones over the LAN.
  plugins: [react(), basicSsl()],

  server: {
    port: 5173,
    strictPort: false,
    host: true,
    // Only ngrok tunnel domains, not `true` (which disables Vite's DNS-rebinding
    // protection entirely). LAN IPs and localhost are always allowed by Vite,
    // so phone testing over Wi-Fi is unaffected.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        ws: true,
      }
    }
  },

  preview: {
    port: 4173,
    strictPort: false,
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
