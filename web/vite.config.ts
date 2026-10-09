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
    },
  },
})
