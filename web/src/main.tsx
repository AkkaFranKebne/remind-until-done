// First: it changes how every zod schema below is built.
import './lib/zodConfig'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App.tsx'
import { answerWhichWindow } from './features/pwa/answerWhichWindow'
import { createFirebaseClients } from './lib/firebase'

async function start() {
  // npm run dev:mock (Vite mode "mock"): a fake API and sign-in in the browser. In every other
  // mode this comparison is false when Vite builds, so the mock code is left out of the bundle.
  const { authClient, pushClient } =
    import.meta.env.MODE === 'mock'
      ? await (await import('./mocks/startMockMode')).startMockMode()
      : createFirebaseClients()

  // The service worker (app shell + pushes, src/sw.ts) exists only in builds. A failure here
  // (an old browser, a private window) just means no offline shell and no pushes.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    answerWhichWindow()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App authClient={authClient} pushClient={pushClient} />
    </StrictMode>,
  )
}

void start()
