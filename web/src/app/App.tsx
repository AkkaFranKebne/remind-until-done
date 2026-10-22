import { QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../components/ui/Toast'
import { AuthProvider } from '../features/auth/AuthProvider'
import { PushClientProvider } from '../features/notifications/PushClientProvider'
import { createQueryClient } from '../lib/api/queryClient'
import type { AuthClient } from '../lib/authClient'
import type { PushClient } from '../lib/pushClient'
import { AppRouter } from './AppRouter'
import { createAppRouter } from './router'

const router = createAppRouter()
const queryClient = createQueryClient()

/** The whole app. main.tsx passes sign-in and push: Firebase, or the fakes in mock mode. */
export function App({
  authClient,
  pushClient,
}: {
  authClient: AuthClient
  pushClient: PushClient
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={authClient}>
        <PushClientProvider client={pushClient}>
          <ToastProvider>
            <AppRouter router={router} />
          </ToastProvider>
        </PushClientProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
