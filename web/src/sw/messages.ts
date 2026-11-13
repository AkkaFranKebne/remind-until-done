/**
 * What the service worker tells the app's open pages (sw.ts sends, usePushRefresh reads).
 * Shared, so both sides agree on the shape. Pure, so Jest can test it.
 */

const PUSH_ARRIVED = 'rud:push-arrived'

/** A push arrived; reminderId is null for a push about no reminder (a Firebase console test). */
export type PushArrived = { type: typeof PUSH_ARRIVED; reminderId: string | null }

export function pushArrived(reminderId: string | undefined): PushArrived {
  return { type: PUSH_ARRIVED, reminderId: reminderId ?? null }
}

/**
 * A message from the worker → PushArrived, or undefined for anything else (in mock mode MSW's
 * worker sends messages too).
 */
export function readPushArrived(data: unknown): PushArrived | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const { type, reminderId } = Object.fromEntries(Object.entries(data))
  if (type !== PUSH_ARRIVED) return undefined
  return {
    type,
    reminderId: typeof reminderId === 'string' && reminderId !== '' ? reminderId : null,
  }
}

const WHICH_WINDOW = 'rud:which-window'
const WINDOW_KIND = 'rud:window-kind'

/**
 * The worker asks an open page whether it is the installed app or a browser tab: to the worker
 * both are just windows of our site. The page answers on the port sent along (windowKind).
 */
export type WhichWindow = { type: typeof WHICH_WINDOW }

export function whichWindow(): WhichWindow {
  return { type: WHICH_WINDOW }
}

export function isWhichWindow(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === WHICH_WINDOW
}

/** A page's answer: installed is true in the installed app's own window. */
export type WindowKind = { type: typeof WINDOW_KIND; installed: boolean }

export function windowKind(installed: boolean): WindowKind {
  return { type: WINDOW_KIND, installed }
}

/** An answer → whether that page is the installed app; anything else → false. */
export function readWindowKind(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const { type, installed } = Object.fromEntries(Object.entries(data))
  return type === WINDOW_KIND && installed === true
}
