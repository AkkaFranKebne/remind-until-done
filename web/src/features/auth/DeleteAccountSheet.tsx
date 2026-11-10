import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmSheet } from '../../components/ui/ConfirmSheet'
import { TextField } from '../../components/ui/TextField'
import { ERROR, errorText } from '../../lib/api/errorText'
import { deleteMe } from '../../lib/api/generated/user/user'
import { forgetDeletedDevice } from '../notifications/forgetThisDevice'
import { usePushClient } from '../notifications/usePushClient'
import { useAuth } from './useAuth'

const CONFIRM_WORD = 'DELETE'

/**
 * Deleting the account: the user types DELETE to unlock the button, and only Cancel closes the
 * sheet, so that typing isn't lost. On Settings, and on the invite-only screen (decision 79).
 * networkMode 'always': offline, it fails with the message instead of pausing forever. The route's
 * guard then goes to /login, which says the account was deleted.
 * Design Inventory → Destructive account flows → "Delete account", UX Copy.
 */
export function DeleteAccountSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accountDeleted } = useAuth()
  const push = usePushClient()
  const [typed, setTyped] = useState('')
  const remove = useMutation({
    mutationFn: async () => {
      await deleteMe()
      await forgetDeletedDevice(push)
      await accountDeleted()
    },
    networkMode: 'always',
  })

  return (
    <ConfirmSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTyped('')
          remove.reset()
        }
        onOpenChange(next)
      }}
      icon={Trash2}
      title="Delete your account?"
      confirmLabel="Delete"
      danger
      cancelOnly
      confirming={remove.isPending}
      confirmDisabled={typed.trim() !== CONFIRM_WORD}
      onConfirm={() => remove.mutate()}
      extra={
        <div className="flex w-full flex-col gap-2 text-left">
          <TextField
            name="confirm-delete"
            label="Type DELETE"
            value={typed}
            onChange={setTyped}
            exact
          />
          {remove.isError ? (
            <p role="alert" className="text-sm text-error-text">
              {errorText(remove.error, ERROR.generic)}
            </p>
          ) : null}
        </div>
      }
    >
      This deletes everything. Your reminders, your history, your excuses. Type DELETE to confirm.
    </ConfirmSheet>
  )
}
