import { queryOptions, useQuery } from '@tanstack/react-query'
import type { User } from '../../lib/api/generated/model'
import { getGetMeQueryKey, getMe, updateMe } from '../../lib/api/generated/user/user'
import { useAuth } from './useAuth'

/** The phone's time zone, e.g. "Europe/Stockholm". */
function deviceTimezone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
}

/**
 * GET /me, cached under orval's key for it. AuthProvider loads it during sign-in, so
 * signed-in pages find it in the cache. It stays there until sign-out clears the cache.
 *
 * Design doc 5.6: the server keeps the user's time zone, the phone knows the real one.
 * Each load compares them and sends PATCH /me when they differ (if that fails, the old
 * one stays and the next load tries again).
 */
export function meQueryOptions() {
  return queryOptions({
    queryKey: getGetMeQueryKey(),
    queryFn: async ({ signal }): Promise<User> => {
      const me = await getMe({ signal })
      const tz = deviceTimezone()
      if (!tz || tz === me.timezone) return me
      return updateMe({ timezone: tz }, { signal }).catch(() => me)
    },
    staleTime: 5 * 60_000, // settings rarely change; reload after 5 minutes at most
    gcTime: Infinity,
  })
}

/** The signed-in user's settings (GET /me), or undefined when nobody is signed in. */
export function useMe(): User | undefined {
  const { state } = useAuth()
  return useQuery({ ...meQueryOptions(), enabled: state.status === 'signedIn' }).data
}
