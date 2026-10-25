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
