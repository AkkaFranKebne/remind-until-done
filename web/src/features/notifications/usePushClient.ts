import { createContext, useContext } from 'react'
import type { PushClient } from '../../lib/pushClient'

export const PushClientContext = createContext<PushClient | null>(null)

/** The push client (Firebase, or a fake in mock mode and tests), from <PushClientProvider>. */
export function usePushClient(): PushClient {
  const client = useContext(PushClientContext)
  if (!client) throw new Error('usePushClient must be used inside <PushClientProvider>')
  return client
}
