/**
 * This device's id, kept in localStorage (design doc 5.7).
 *
 * The API gives each device an id when it registers (POST /devices), and only one device per
 * account gets the pushes. To show "this device gets the pushes" or "another device took over",
 * Settings compares the id the API has (GET /devices) with the one kept here.
 *
 * If the browser blocks storage or it was cleared, there's no id to compare, so this device looks
 * like "another device". Tapping "Use this device instead" registers it again and fixes that.
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
    // Blocked storage: this device will look like "another device" (see above).
  }
}
