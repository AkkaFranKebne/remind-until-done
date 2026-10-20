import { useMutation } from '@tanstack/react-query'
import { CircleAlert, Lock } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { CenteredScreen } from '../../components/ui/CenteredScreen'
import { Wordmark } from '../../components/ui/Wordmark'
import { useAuth } from './useAuth'
import { GoogleIcon } from './GoogleIcon'
import { SplashScreen } from './SplashScreen'

/** The wordmark and tagline; the space under them depends on what follows (Inventory mockup). */
const brandBlock = cva('flex flex-col items-center gap-2.5', {
  variants: {
    look: { signIn: 'pb-12', error: 'pb-5.5', notInvited: 'pb-7' },
  },
})

/**
 * /login: sign in with Google (design doc 5.1).
 * Design Inventory → Phone Screens → Login: "Already installed", "Sign-in error",
 * "Not on allowlist". No TopBar: the big wordmark is the one "rud." on screen.
 * The install gate (iOS steps, Android "Install app") comes in M3.
 */
export function LoginPage() {
  const { state, signIn } = useAuth()
  // The page goes to Google next: TanStack keeps the button busy (isPending) until then.
  // networkMode 'always': offline, the sign-in should fail with its message, not pause forever.
  const google = useMutation({ mutationFn: signIn, networkMode: 'always' })
  const { reset } = google

  // Going to Google, the browser may freeze this page in its back/forward cache.
  // Pressing Back then shows the frozen page again, with the button still busy.
  // "pageshow" with persisted = true means exactly that: un-busy the button.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [reset])

  // Signed in: the route's beforeLoad sends you on to `next` (app/router.tsx); until then, the splash.
  if (state.status === 'checking' || state.status === 'signedIn') return <SplashScreen />

  // Centred top-to-bottom in every state, like the splash (Inventory → Phone Screens → Login).
  const notInvited = state.status === 'notInvited'

  return (
    <CenteredScreen className="gap-0">
      <div
        className={brandBlock({
          look: notInvited ? 'notInvited' : state.error ? 'error' : 'signIn',
        })}
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
            loading={google.isPending}
            onClick={() => google.mutate()}
          >
            {state.error ? 'Try again' : 'Continue with Google'}
          </Button>
          {state.error ? null : <p className="text-sm text-fg2">rud. is invite-only.</p>}
        </div>
      )}
    </CenteredScreen>
  )
}
