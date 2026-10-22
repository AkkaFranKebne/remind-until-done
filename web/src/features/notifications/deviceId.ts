/**
 * This device's id, kept in localStorage (design doc 5.7).
 *
 * The API gives each device an id when it registers (POST /devices), and only one device per
 * account gets the pushes. To show "this device gets the pushes" or "another device took over",
 * Settings compares the id the API has (GET /devices) with the one kept here.
 *
 * No id here means this device looks like "another device":
 * - storage was cleared: tapping "Use this device instead" registers again and saves a new id;
 * - the browser blocks storage (rare, e.g. some private modes): nothing can be saved, so it keeps
 *   looking like "another device", although pushes do reach it after the tap.
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
