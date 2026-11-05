import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

/**
 * Are we online? (design doc 5.3, decision 76.) TanStack Query's onlineManager holds the answer: it
 * listens to the browser's online and offline events, and pauses and resumes queries with it.
 * navigator.onLine can be wrong, so a request that never reached the server is a second signal.
 */
const PROBE_URL = '/api/v1/healthz'
// Long enough for a cold start, which waits for the database before answering.
const PROBE_LIMIT_MS = 12_000

export function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
  )
}

/**
 * Does the server answer at all? Any answer counts, errors too. /healthz is public, has no login,
 * and reports a stored result: only a cold start touches the database. It's the one API call outside the fetch wrapper: the wrapper
 * calls this when a request fails, and this must not count as one of those failures.
 */
export async function serverReachable(): Promise<boolean> {
  try {
    await fetch(PROBE_URL, { cache: 'no-store', signal: AbortSignal.timeout(PROBE_LIMIT_MS) })
    return true
  } catch {
    return false
  }
}

let checking = false

/**
 * A request never reached the server. One failure isn't "offline": an iPhone waking the app up
 * can fail a request or two. So ask once more, and only then say so.
 */
export function requestFailed() {
  if (checking || !onlineManager.isOnline()) return
  checking = true
  void serverReachable().then((reachable) => {
    checking = false
    if (!reachable) onlineManager.setOnline(false)
  })
}
