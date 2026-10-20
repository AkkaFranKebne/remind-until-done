import { http, HttpResponse } from 'msw'
import * as z from 'zod/mini'
import type { Device } from '../lib/api/generated/model'

/**
 * The devices part of the `npm run dev:mock` fake API (see devApi.ts): one device for the one
 * fake user, with the real API's rules (design doc 5.7, decision 40). The same push token again
 * keeps its id and refreshes lastSeenAt; a new token is a new device (new id) that replaces the
 * old one; the token is never sent back; userAgent comes from the request; unknown ids are 404.
 */

type SavedDevice = Device & { fcmToken: string }

let device: SavedDevice | null = null
let nextId = 1

/** Back to "no device registered" (tests). */
export function resetDevDevices() {
  device = null
  nextId = 1
}

const RegisterBody = z.object({
  fcmToken: z.string().check(z.minLength(1), z.maxLength(2048)),
  platform: z.enum(['ios', 'android', 'web']),
})

const view = ({ fcmToken: _token, ...shown }: SavedDevice): Device => shown

const notFound = () =>
  HttpResponse.json({ error: { code: 'not_found', message: 'no such device' } }, { status: 404 })

export const devDevicesHandlers = [
  http.get('*/api/v1/devices', () => HttpResponse.json({ items: device ? [view(device)] : [] })),

  http.post('*/api/v1/devices', async ({ request }) => {
    const parsed = RegisterBody.safeParse(await request.json())
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: 'validation_failed', message: 'body does not match swagger.json' } },
        { status: 400 },
      )
    }
    const { fcmToken, platform } = parsed.data
    const now = new Date().toISOString()
    const userAgent = request.headers.get('User-Agent')?.slice(0, 512) || null
    if (device?.fcmToken === fcmToken) {
      device = { ...device, platform, userAgent, lastSeenAt: now }
    } else {
      const id = `00000000-0000-4000-9000-${String(nextId++).padStart(12, '0')}`
      device = { id, fcmToken, platform, userAgent, createdAt: now, lastSeenAt: now }
    }
    return HttpResponse.json(view(device))
  }),

  http.delete('*/api/v1/devices/:id', ({ params }) => {
    if (!device || device.id !== params.id) return notFound()
    device = null
    return new HttpResponse(null, { status: 204 })
  }),
]
