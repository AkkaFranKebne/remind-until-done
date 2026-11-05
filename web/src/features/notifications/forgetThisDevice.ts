import { deleteDevice } from '../../lib/api/generated/devices/devices'
import { ApiError } from '../../lib/api/mutator'
import type { PushClient } from '../../lib/pushClient'
import { clearDeviceId, loadDeviceId } from './deviceId'
import { registrationSettled, resetRegisterOnStart } from './useNotifications'

/** Sign-out shouldn't wait longer than this for the cleanup (a slow or hanging network). */
const CLEANUP_LIMIT_MS = 5000

/**
 * Before sign-out (design doc 5.7, decision 46): remove this device from the API
 * (DELETE /devices/{id}, while the sign-in token still works) and delete the push token, so the
 * next account on this browser starts clean. Best effort: offline, an error or a slow answer never
 * blocks signing out.
 * - A registration still running (opened the app a moment ago) finishes first, so its device
 *   isn't saved after the cleanup.
 * - The kept id is cleared only when the API no longer has the device (deleted, or a 404: another
 *   device took over). If the DELETE failed, it stays: signing back in then still sees "this
 *   device", and another account's registration replaces it anyway.
 */
export async function forgetThisDevice(push: PushClient): Promise<void> {
  const cleanup = (async () => {
    await registrationSettled()
    const id = loadDeviceId()
    const [api] = await Promise.allSettled([id ? deleteDevice(id) : null, push.deleteToken()])
    const gone =
      api.status === 'fulfilled' || (api.reason instanceof ApiError && api.reason.status === 404)
    if (gone) clearDeviceId()
  })()
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, CLEANUP_LIMIT_MS)
  })
  await Promise.race([cleanup, limit])
  clearTimeout(timer)
  resetRegisterOnStart()
}

/**
 * After the account was deleted: the API has no device any more, so only this browser's side is
 * left. Best effort, like signing out.
 */
export async function forgetDeletedDevice(push: PushClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, CLEANUP_LIMIT_MS)
  })
  const cleanup = (async () => {
    await registrationSettled() // one still running would save its device after this
    await push.deleteToken().catch(() => {})
  })()
  await Promise.race([cleanup, limit])
  clearTimeout(timer)
  clearDeviceId()
  resetRegisterOnStart()
}
