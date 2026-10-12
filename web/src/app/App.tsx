import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from '../features/auth/AuthProvider'
import { createFirebaseAuthClient } from '../lib/firebase'
import { createAppRouter } from './router'

const router = createAppRouter()
const authClient = createFirebaseAuthClient()

export function App() {
  return (
    <AuthProvider client={authClient}>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
