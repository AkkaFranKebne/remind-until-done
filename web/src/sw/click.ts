import { doneFailed, urlOf, type ShownNotification } from './notification'

/** The API path for a notification's Done button (swagger.json: applyAction, decision 72). */
const ACTIONS_URL = '/api/v1/actions'

/** Past this the tap counts as failed: the user gets the message, not silence. */
const TIMEOUT_MS = 15_000

/** What a tap needs from the worker (small, so tests can pass fakes). */
type Worker = {
  open: (path: string) => Promise<void>
  show: (shown: ShownNotification) => Promise<void>
  closeAll: (tag: string) => Promise<void>
  tellPages: (reminderId: string | undefined) => Promise<void>
  post: (url: string, init: RequestInit) => Promise<Response>
}

/** What a tap on a notification says. tag is the reminder's id. */
type Click = { action: string; data: unknown; tag: string }

/**
 * A tap on a notification (design doc 3.5, decision 72); the phone closed it already.
 * - Done: tells the API. On success nothing more shows. If it fails, a new notification says so,
 *   and tapping that opens the reminder, which has its own Done button.
 * - Remind later: nothing else. The next nag is booked anyway.
 * - The body: opens the reminder.
 * The token is never logged.
 */
export async function handleClick({ action, data, tag }: Click, worker: Worker) {
  if (action === 'remind-later') return
  if (action !== 'done') {
    await worker.open(urlOf(data))
    return
  }
  if (await sendDone(tokenOf(data), worker.post)) {
    // A nag may have arrived while the request ran: it's about a finished reminder now.
    if (tag) await worker.closeAll(tag)
    await worker.tellPages(tag || undefined)
  } else {
    await worker.show(doneFailed(urlOf(data), tag))
  }
}

/** true if the reminder needs nothing more: done, or deleted meanwhile (404). */
async function sendDone(token: string | undefined, post: Worker['post']) {
  if (!token) return false
  try {
    const answer = await post(ACTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      redirect: 'error', // a redirect would carry the token along
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return answer.ok || answer.status === 404
  } catch {
    return false // no connection, or too slow
  }
}

function tokenOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const { doneToken } = Object.fromEntries(Object.entries(data))
  return typeof doneToken === 'string' && doneToken !== '' ? doneToken : undefined
}
