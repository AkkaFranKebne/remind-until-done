import { Navigate, useSearch } from '@tanstack/react-router'
import { CircleAlert, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Wordmark } from '../../components/ui/Wordmark'
import { cn } from '../../lib/cn'
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

  // Going to Google, the browser may freeze this page in its back/forward cache.
  // Pressing Back then shows the frozen page again, with the button still busy.
  // "pageshow" with persisted = true means exactly that: un-busy the button.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLeaving(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  if (state.status === 'checking') return <SplashScreen />
  if (state.status === 'signedIn') return <Navigate to={next ?? '/'} replace />

  const continueWithGoogle = () => {
    setLeaving(true) // the page goes to Google next; keep the button busy until then
    void signIn().finally(() => setLeaving(false))
  }

  // Centred top-to-bottom in every state, like the splash (Inventory → Phone Screens → Login).
  const notInvited = state.status === 'notInvited'

  return (
    <main
      className={cn(
        'flex min-h-dvh flex-col items-center justify-center px-4 text-center',
        'pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
      )}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-2.5',
          notInvited ? 'pb-7' : state.error ? 'pb-5.5' : 'pb-12',
        )}
      >
        <Wordmark as="h1" />
        <p className="text-sm text-balance text-fg2">
          The reminder app that won&apos;t let you forget.
        </p>
      </div>

      {notInvited ? (
        <section className="flex flex-col items-center gap-3.5" aria-labelledby="invite-only">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-md bg-error-bg text-error"
          >
            <Lock size={24} strokeWidth={1.75} />
          </span>
          <h2 id="invite-only" className="text-lg font-bold text-balance">
            This app is invite-only.
          </h2>
          {state.email ? (
            <p className="rounded-sm bg-bg3 px-3 py-1.5 font-mono text-sm text-fg2">
              {state.email}
            </p>
          ) : null}
          <p className="text-sm text-balance text-fg2">
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
          {state.error ? null : <p className="text-sm text-fg2">rud. is invite-only.</p>}
        </div>
      )}
    </main>
  )
}
