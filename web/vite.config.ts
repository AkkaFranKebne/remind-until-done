import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Locally, send /api calls to the Go API (make run in api/), like the
    // Firebase Hosting rewrite does in dev and prod (design doc 6.7).
    proxy: {
      '/api': 'http://localhost:8080',
      // Firebase's own pages and settings (/__/auth for the Google sign-in round
      // trip, /__/firebase/init.json for the web settings) come from the dev site,
      // like Firebase Hosting serves them on web.app. So local sign-in uses the same
      // redirect flow as dev and prod (design doc decision 32).
      '/__': { target: 'https://rud-dev-4f7k2.web.app', changeOrigin: true },
    },
  },
})
