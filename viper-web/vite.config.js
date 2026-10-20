import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate', // Se actualiza sola cuando subes cambios
      manifest: {
        name: 'Viper - Gestión Deportiva',
        short_name: 'Viper',
        description: 'Sistema Integral de Gestión Deportiva',
        theme_color: '#09090B',
        background_color: '#09090B',
        display: 'standalone', // Hace que al abrirse no se vea la barra de direcciones del navegador
        icons: [
          {
            src: 'pwa-192x192.png', // Tendrás que crear estas imágenes y ponerlas en la carpeta /public
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Clave para que el ícono se adapte bien en Android
          }
        ]
      }
    })
  ],
})
