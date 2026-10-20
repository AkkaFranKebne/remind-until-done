import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { ToastProvider } from '../components/ui/Toast'
import { AuthProvider } from '../features/auth/AuthProvider'
import { createQueryClient } from '../lib/api/queryClient'
import { createFirebaseAuthClient } from '../lib/firebase'
import { createAppRouter } from './router'

const router = createAppRouter()
const authClient = createFirebaseAuthClient()
const queryClient = createQueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={authClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
