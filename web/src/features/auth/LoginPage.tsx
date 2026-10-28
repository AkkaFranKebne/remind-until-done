import { useMutation } from '@tanstack/react-query'
import { CircleAlert, Download, Lock } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { useEffect } from 'react'
import { Button } from '../../components/ui/Button'
import { CenteredScreen } from '../../components/ui/CenteredScreen'
import { Wordmark } from '../../components/ui/Wordmark'
import { IosInstallSteps } from '../pwa/IosInstallSteps'
import { IosVersionGate } from '../pwa/IosVersionGate'
import { MIN_IOS } from '../pwa/platform'
import { tabInstallLine } from '../pwa/tabInstall'
import { useInstall, type InstallState } from '../pwa/useInstall'
import { useAuth } from './useAuth'
import { GoogleIcon } from './GoogleIcon'
import { SplashScreen } from './SplashScreen'

/** The wordmark and tagline; the space under them depends on what follows (Inventory mockup). */
const brandBlock = cva('flex flex-col items-center gap-2.5', {
  variants: {
    look: { signIn: 'pb-12', install: 'pb-5', error: 'pb-5.5', notInvited: 'pb-7' },
  },
})

/** The line under the sign-in button, by install state (none on an iPhone tab: no button). */
const footnote = {
  installed: 'rud. is invite-only.',
  installable: 'Push notifications need the installed app.',
  'just-installed': 'Push notifications need the installed app.',
  'app-found': tabInstallLine['app-found'],
  unavailable: tabInstallLine.unavailable,
} satisfies Record<Exclude<InstallState, 'ios-too-old' | 'ios-browser'>, string>

/**
 * /login: install first, then sign in with Google (design doc §0 install gate, 5.1).
 * Design Inventory → Phone Screens → Login: "iOS — not installed" (steps only, no sign-in),
 * "Android / Desktop — installable" (Install app first, sign-in below), "Already installed",
 * "Sign-in error", "Not on allowlist"; Global overlays → "iOS version gate".
 * No TopBar: the big wordmark is the one "rud." on screen.
 */
export function LoginPage() {
  const { state, signIn } = useAuth()
  // The page goes to Google next: TanStack keeps the button busy (isPending) until then.
  // networkMode 'always': offline, the sign-in should fail with its message, not pause forever.
  const google = useMutation({ mutationFn: signIn, networkMode: 'always' })
  const { reset } = google
  const { state: install, ios, install: prompt } = useInstall()

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

  // No web push on this iPhone: nothing else matters (any state, even mid-sign-in).
  if (install === 'ios-too-old') return <IosVersionGate ios={ios} />

  // Signed in: the route's beforeLoad sends you on to `next` (app/router.tsx); until then, the splash.
  if (state.status === 'checking' || state.status === 'signedIn') return <SplashScreen />

  // Centred top-to-bottom in every state, like the splash (Inventory → Phone Screens → Login).
  const notInvited = state.status === 'notInvited'

  return (
    <CenteredScreen className="gap-0">
      <div
        className={brandBlock({
          look: notInvited
            ? 'notInvited'
            : state.error
              ? 'error'
              : install === 'installed'
                ? 'signIn'
                : 'install',
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
            className="flex size-14 items-center justify-center rounded-md bg-error-bg text-error-text"
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
      ) : install === 'ios-browser' ? (
        // iPhone in a browser tab: the steps only. Signing in here would be wasted: the
        // installed app keeps its own sign-in (design doc §0).
        <>
          <IosInstallSteps device={ios.device} />
          <p className="mt-5 text-xs text-fg2">
            Sign-in available after installing.
            <br />
            Requires iOS {MIN_IOS.join('.')} or later.
            <br />
            {/* Safari can't tell whether the app is installed (decision 42). */}
            Already installed? Open rud. from your Home Screen.
          </p>
        </>
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-3.5">
          {install === 'installable' ? (
            <>
              <Button
                size="lg"
                icon={Download}
                loading={prompt.isPending}
                onClick={() => prompt.mutate()}
              >
                Install app
              </Button>
              <p className="flex items-center gap-2.5 text-xs text-fg2">
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                or, if already installed
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </p>
            </>
          ) : null}
          {install === 'just-installed' ? (
            <output className="block rounded-md bg-accent-bg px-3.5 py-3 text-sm text-accent">
              {tabInstallLine['just-installed']}
            </output>
          ) : null}
          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-error-bg px-3.5 py-3 text-left text-sm text-error-text"
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
          {state.error && install === 'installed' ? null : (
            <p className="text-sm text-fg2">{footnote[install]}</p>
          )}
        </div>
      )}
    </CenteredScreen>
  )
}
