import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App.tsx'
import { createFirebaseAuthClient } from './lib/firebase'

async function start() {
  // npm run dev:mock (Vite mode "mock"): a fake API and sign-in in the browser. In every other
  // mode this comparison is false when Vite builds, so the mock code is left out of the bundle.
  const authClient =
    import.meta.env.MODE === 'mock'
      ? await (await import('./mocks/startMockMode')).startMockMode()
      : createFirebaseAuthClient()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App authClient={authClient} />
    </StrictMode>,
  )
}

void start()
