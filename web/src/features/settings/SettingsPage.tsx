import { Button as BaseButton } from '@base-ui/react/button'
import { useMutation } from '@tanstack/react-query'
import { ChevronRight, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AppScreen } from '../../app/AppScreen'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { PageHeader } from '../../components/ui/PageHeader'
import { DeleteAccountSheet } from '../auth/DeleteAccountSheet'
import { useAuth } from '../auth/useAuth'
import { useMe } from '../auth/useMe'
import { forgetThisDevice } from '../notifications/forgetThisDevice'
import { NotificationsSection } from '../notifications/NotificationsSection'
import { usePushClient } from '../notifications/usePushClient'
import { PreferencesSection } from './PreferencesSection'

/**
 * /settings: notifications on this device, preferences and the account (M3).
 * Design Inventory → Phone Screens → Settings ("Default", "Notifications denied — iOS",
 * "No device registered", "Sign-out confirm"), Destructive account flows → "Delete account".
 */
export function SettingsPage() {
  const { user, signOut } = useAuth()
  const me = useMe() // email and settings: our API (GET /me)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const push = usePushClient()
  // Signing out: first this device leaves the API and its push token is deleted (best effort,
  // design doc 5.7), then Firebase signs out. The button stays busy (isPending) until it's done;
  // then the route's guard (app/router.tsx) sends you to the plain /login (no `next`: you signed
  // out on purpose). networkMode 'always': Firebase signs out offline too; TanStack's default
  // would pause the mutation while offline and leave the button busy.
  const leave = useMutation({
    mutationFn: async () => {
      await forgetThisDevice(push)
      await signOut()
    },
    networkMode: 'always',
  })

  // RequireAuth only shows this page when signed in.
  if (!user) return null
  const email = me?.email ?? user.email ?? ''
  const name = user.name ?? email // the name comes from Google only; the API doesn't store it

  return (
    <AppScreen showSettings={false}>
      <div className="flex flex-col gap-6">
        <PageHeader title="Settings" backTo="/" />

        <NotificationsSection />

        <PreferencesSection />

        <section aria-labelledby="account">
          <h2
            id="account"
            className="border-b border-border px-1 pb-2 text-xs font-bold tracking-wider text-fg2 uppercase"
          >
            Account
          </h2>
          <div className="flex items-center gap-3.5 border-b border-border px-3.5 py-3.5">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-bg text-base font-semibold text-accent"
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{name}</p>
              <p className="truncate text-sm text-fg2">{email}</p>
            </div>
          </div>
          {/* A plain link: the privacy notice is its own page outside the app (design doc 7.3). */}
          <a
            href="/privacy.html"
            className="flex min-h-11 w-full items-center gap-3.5 border-b border-border px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span
              aria-hidden="true"
              className="flex size-8.5 shrink-0 items-center justify-center rounded-md bg-bg3 text-fg2"
            >
              <ShieldCheck size={17} strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-base font-medium">Privacy</span>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-fg3" />
          </a>
          <BaseButton
            onClick={() => setConfirming(true)}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3.5 border-b border-border px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span
              aria-hidden="true"
              className="flex size-8.5 shrink-0 items-center justify-center rounded-md bg-bg3 text-fg2"
            >
              <LogOut size={17} strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-base font-medium">Sign out</span>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-fg3" />
          </BaseButton>
          <BaseButton
            onClick={() => setDeleting(true)}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3.5 border-b border-border px-3.5 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span
              aria-hidden="true"
              className="flex size-8.5 shrink-0 items-center justify-center rounded-md bg-error-bg text-error-text"
            >
              <Trash2 size={17} strokeWidth={1.75} />
            </span>
            <span className="flex-1 text-base font-medium text-error-text">Delete account</span>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-fg3" />
          </BaseButton>
        </section>

        <ConfirmSheet
          open={confirming}
          onOpenChange={setConfirming}
          icon={LogOut}
          title="Sign out?"
          confirmLabel="Sign out"
          confirming={leave.isPending}
          onConfirm={() => leave.mutate()}
        >
          No notifications on this device until you&apos;re back. Anything that fires meanwhile goes
          straight to Overdue. We&apos;ll pretend not to notice.
        </ConfirmSheet>
        <DeleteAccountSheet open={deleting} onOpenChange={setDeleting} />
      </div>
    </AppScreen>
  )
}
