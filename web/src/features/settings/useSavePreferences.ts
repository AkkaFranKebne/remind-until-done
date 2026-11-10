import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/useToast'
import { getGetMeQueryKey, updateMe } from '../../lib/api/generated/user/user'
import type { UpdateUser, User } from '../../lib/api/generated/model'
import { ERROR, errorText } from '../../lib/api/errorText'

/**
 * Saves a preference (PATCH /me, decision 47). The setting changes on screen at once; the API's
 * answer replaces it, a refusal puts the old one back. A toast either way. Quick changes are
 * saved one after another (`scope`), so an older answer never lands on a newer pick.
 */
export function useSavePreferences() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = getGetMeQueryKey()
  return useMutation({
    scope: { id: 'me' },
    mutationFn: (patch: UpdateUser) => updateMe(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<User>(key)
      if (before) queryClient.setQueryData<User>(key, { ...before, ...patch })
      return { before }
    },
    onError: (error, _patch, context) => {
      if (context?.before) queryClient.setQueryData<User>(key, context.before)
      toast.error(errorText(error, ERROR.save))
    },
    onSuccess: (me) => {
      queryClient.setQueryData<User>(key, me)
      toast.success('Noted.')
    },
  })
}
