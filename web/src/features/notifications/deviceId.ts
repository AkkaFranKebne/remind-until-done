/**
 * The id the API gave this device (POST /devices), kept in this browser (design doc 5.7). It
 * tells "this device gets the pushes" from "another one took over". Storage can be blocked or
 * cleared: then it's simply unknown.
 */
const KEY = 'rud.deviceId'

export function loadDeviceId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveDeviceId(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Blocked storage: next start, this device looks like "another device" until re-enabled.
  }
}
