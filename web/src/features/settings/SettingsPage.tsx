import { Button as BaseButton } from '@base-ui/react/button'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, LogOut } from 'lucide-react'
import { useState } from 'react'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { PageHeader } from '../../components/ui/PageHeader'
import { useAuth } from '../auth/useAuth'
import { useMe } from '../auth/useMe'

/**
 * /settings. M1 has the Account section only; notifications and preferences come
 * with push (M3) and reminders (M2).
 * Design Inventory → Phone Screens → Settings ("Default", "Sign-out confirm").
 */
export function SettingsPage() {
  const { user, signOut } = useAuth()
  const me = useMe() // email and settings: our API (GET /me)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  // RequireAuth only shows this page when signed in.
  if (!user) return null
  const email = me?.email ?? user.email ?? ''
  const name = user.name ?? email // the name comes from Google only; the API doesn't store it

  const confirmSignOut = async () => {
    setSigningOut(true)
    await signOut()
    await navigate({ to: '/login', replace: true })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" backTo="/" />

      <section aria-labelledby="account">
        <h2
          id="account"
          className="border-b border-border px-1 pb-2 text-xs font-semibold tracking-wider text-fg2 uppercase"
        >
          Account
        </h2>
        <div className="flex items-center gap-3.5 border-b border-border px-1 py-3.5">
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
        <BaseButton
          onClick={() => setConfirming(true)}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3.5 border-b border-border px-1 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className="flex size-8.5 shrink-0 items-center justify-center rounded-md bg-bg3 text-fg2"
          >
            <LogOut size={17} strokeWidth={1.75} />
          </span>
          <span className="flex-1 text-base">Sign out</span>
          <ChevronRight aria-hidden="true" size={16} strokeWidth={1.75} className="text-fg3" />
        </BaseButton>
      </section>

      <ConfirmSheet
        open={confirming}
        onOpenChange={setConfirming}
        icon={LogOut}
        title="Sign out?"
        note="You'll need to reinstall the app to sign back in on this device."
        confirmLabel="Sign out"
        confirming={signingOut}
        onConfirm={() => void confirmSignOut()}
      >
        Signing out stops all notifications on this phone. Any reminder that fires while you&apos;re
        signed out will go straight to Overdue.
      </ConfirmSheet>
    </div>
  )
}
