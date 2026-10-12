import { Navigate, useSearch } from '@tanstack/react-router'
import { CircleAlert, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Wordmark } from '../../components/ui/Wordmark'
import { useAuth } from './useAuth'
import { GoogleIcon } from './GoogleIcon'
import { SplashScreen } from './SplashScreen'

/**
 * /login: sign in with Google (design doc 5.1).
 * Design Inventory → Phone Screens → Login: "Already installed", "Sign-in error",
 * "Not on allowlist". No TopBar: the big wordmark is the one "rud." on screen.
 * The install gate (iOS steps, Android "Install app") comes in M3.
 */
export function LoginPage() {
  const { state, signIn } = useAuth()
  const { next } = useSearch({ from: '/login' })
  const [leaving, setLeaving] = useState(false)

  if (state.status === 'checking') return <SplashScreen />
  if (state.status === 'signedIn') return <Navigate to={next ?? '/'} replace />

  const continueWithGoogle = () => {
    setLeaving(true) // the page goes to Google next; keep the button busy until then
    void signIn().finally(() => setLeaving(false))
  }

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
      <div className="flex flex-col items-center gap-2.5 pb-7">
        <Wordmark as="h1" />
        <p className="text-base text-balance text-fg2">
          The reminder app that won&apos;t let you forget.
        </p>
      </div>

      {state.status === 'notInvited' ? (
        <section className="flex flex-col items-center gap-3.5" aria-labelledby="invite-only">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-md bg-error-bg text-error"
          >
            <Lock size={24} strokeWidth={1.75} />
          </span>
          <h2 id="invite-only" className="text-xl font-bold text-balance">
            This app is invite-only.
          </h2>
          {state.email ? (
            <p className="rounded-sm bg-bg3 px-3 py-1.5 font-mono text-sm text-fg2">
              {state.email}
            </p>
          ) : null}
          <p className="text-base text-balance text-fg2">
            Your account isn&apos;t on the list. Ask Ewa to add you.
          </p>
        </section>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-3.5">
          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-error-bg px-3.5 py-3 text-left text-sm text-error"
            >
              <CircleAlert
                aria-hidden="true"
                size={16}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0"
              />
              {state.error}
            </p>
          ) : null}
          <Button
            variant="surface"
            size="lg"
            icon={GoogleIcon}
            loading={leaving}
            onClick={continueWithGoogle}
          >
            {state.error ? 'Try again' : 'Continue with Google'}
          </Button>
          {state.error ? null : <p className="text-sm text-fg3">rud. is invite-only.</p>}
        </div>
      )}
    </main>
  )
}
