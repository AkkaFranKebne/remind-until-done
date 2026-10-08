// Calls the API's liveness check. In dev and prod, /api/** goes through the
// Firebase Hosting rewrite to Cloud Run; locally, through the Vite proxy.
//
// Plain fetch for now (milestone M0). From M2, orval generates typed hooks from
// swagger.json, TanStack Query handles loading and errors, and mutator.ts adds
// the Firebase login token (design doc 5.5). This file then goes away.
export async function fetchHealth(): Promise<string> {
  const res = await fetch('/api/v1/healthz')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body: { status: string } = await res.json()
  return body.status
}
