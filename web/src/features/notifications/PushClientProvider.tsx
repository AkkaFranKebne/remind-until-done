import type { ReactNode } from 'react'
import type { PushClient } from '../../lib/pushClient'
import { PushClientContext } from './usePushClient'

/** Hands the push client (Firebase, or a fake in mock mode and tests) to the notification hooks. */
export function PushClientProvider({
  client,
  children,
}: {
  client: PushClient
  children: ReactNode
}) {
  return <PushClientContext value={client}>{children}</PushClientContext>
}
