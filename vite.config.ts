import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // We use injectManifest so we can write custom SW logic for push
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'Flux — Tu Agenda Inteligente',
        short_name: 'Flux',
        description: 'Agenda personal con gestión de bienestar y notificaciones inteligentes.',
        theme_color: '#14b8a6',
        background_color: '#0a0a0f',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
