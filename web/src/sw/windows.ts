import { readWindowKind, whichWindow } from './messages'

/** A page that doesn't answer by then (a page from before this change, a frozen tab) is a tab. */
export const ASK_TIMEOUT_MS = 500

/** The worker's end of a MessageChannel, as far as asking needs it. */
type ReplyEnd = { onmessage: ((event: MessageEvent) => void) | null; close: () => void }

/**
 * Asks one open page whether it is the installed app (the page answers in answerWhichWindow).
 * Never fails: no answer in time counts as a browser tab. newChannel is () => new
 * MessageChannel() in the worker; tests pass a fake (Jest's jsdom has no MessageChannel).
 */
export function isInstalledApp<Port>(
  page: { postMessage: (message: unknown, transfer: Port[]) => void },
  newChannel: () => { port1: ReplyEnd; port2: Port },
  timeoutMs = ASK_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = newChannel()
    const done = (installed: boolean) => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(installed)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    channel.port1.onmessage = (event) => done(readWindowKind(event.data))
    try {
      page.postMessage(whichWindow(), [channel.port2])
    } catch {
      done(false)
    }
  })
}

/**
 * Which open window a tap on a notification shows the reminder in. The installed app first:
 * someone with rud. open in a tab and in the app expects the app. Otherwise the window used
 * last (the browser lists that first), or none, and the worker opens a new one.
 */
export async function pickWindow<W>(
  windows: readonly W[],
  installed: (page: W) => Promise<boolean>,
): Promise<W | undefined> {
  const answers = await Promise.all(windows.map((page) => installed(page).catch(() => false)))
  const app = answers.indexOf(true)
  return app === -1 ? windows[0] : windows[app]
}
