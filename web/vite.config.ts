import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'

/**
 * npm run dev:mock: serves MSW's service worker at /mockServiceWorker.js straight from
 * node_modules (always the installed MSW version). Only in mock mode and only on the dev
 * server: it is never in public/ and never in a build.
 */
function mswWorker(): Plugin {
  const file = createRequire(import.meta.url).resolve('msw/mockServiceWorker.js')
  return {
    name: 'msw-worker',
    apply: (_config, env) => env.command === 'serve' && env.mode === 'mock',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // https://localhost:5173 with a self-made certificate (the browser warns once:
    // "Proceed"). Firebase always returns from Google sign-in to https://<this host>,
    // so local sign-in needs https, like dev and prod (design doc decision 32).
    // Not in mock mode: there's no Google sign-in, and Chrome refuses service workers (MSW's)
    // on a site with a certificate warning, while http://localhost is allowed.
    mode !== 'mock' && basicSsl(),
    mswWorker(),
  ],
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
}))
