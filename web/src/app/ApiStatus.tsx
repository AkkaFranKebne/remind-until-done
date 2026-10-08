import { useEffect, useState } from 'react'
import { fetchHealth } from '../lib/api/health'

type State =
  { kind: 'loading' } | { kind: 'ok'; status: string } | { kind: 'error'; message: string }

// Shows whether the app can reach the API. Temporary: it proves the
// /api rewrite works (milestone M0) and goes away once real pages exist.
export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    fetchHealth()
      .then((status) => setState({ kind: 'ok', status }))
      .catch((err: Error) => setState({ kind: 'error', message: err.message }))
  }, [])

  switch (state.kind) {
    case 'loading':
      return <p>Checking the API…</p>
    case 'ok':
      return <p className="status-ok">API: {state.status}</p>
    case 'error':
      return <p className="status-error">API unreachable ({state.message})</p>
  }
}
