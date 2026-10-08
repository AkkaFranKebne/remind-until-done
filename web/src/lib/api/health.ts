// Calls the API's liveness check. In dev and prod, /api/** goes through the
// Firebase Hosting rewrite to Cloud Run; locally, through the Vite proxy.
export async function fetchHealth(): Promise<string> {
  const res = await fetch('/api/v1/healthz')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body: { status: string } = await res.json()
  return body.status
}
