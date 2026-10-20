import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '../features/auth/AuthProvider'
import { createQueryClient } from '../lib/api/queryClient'
import type { AuthClient } from '../lib/authClient'
import { createAppRouter } from './router'

const router = createAppRouter()
const queryClient = createQueryClient()

/** The whole app. main.tsx passes the sign-in: Firebase, or the fake one in mock mode. */
export function App({ authClient }: { authClient: AuthClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={authClient}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
