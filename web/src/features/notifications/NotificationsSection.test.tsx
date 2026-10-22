import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Device } from '../../lib/api/generated/model'
import { server } from '../../mocks/server'
import {
  IPHONE_17,
  pretendDeviceId,
  pretendInstalled,
  pretendNotifications,
  pretendUserAgent,
  resetDevice,
} from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { FakePushClient } from '../../test-utils/fakePushClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

const device = (id: string): Device => ({
  id,
  platform: 'ios',
  userAgent: null,
  createdAt: '2026-10-21T08:00:00Z',
  lastSeenAt: '2026-10-21T08:00:00Z',
})

/** The fake API's devices: `registered` at first; POST registers as `newId` (one per user). */
function mockDevices(registered: Device | null, newId = 'd-new') {
  const posted: unknown[] = []
  let current = registered
  server.use(
    http.get('*/api/v1/devices', () => HttpResponse.json({ items: current ? [current] : [] })),
    http.post('*/api/v1/devices', async ({ request }) => {
      posted.push(await request.json())
      current = device(newId)
      return HttpResponse.json(current)
    }),
  )
  return posted
}

/** Settings, and its Notifications section (the toasts' area is also named "Notifications"). */
async function openSettings(push = new FakePushClient()) {
  renderApp('/settings', new FakeAuthClient(tester), push)
  const heading = await screen.findByRole('heading', { level: 2, name: 'Notifications' })
  const section = heading.closest('section')
  if (!section) throw new Error('no Notifications section')
  return section
}

describe('Settings → Notifications', () => {
  beforeEach(() => mockMe())
  afterEach(resetDevice)

  it('in a browser tab: needs the installed app, nothing to tap', async () => {
    pretendNotifications('default')
    const section = await openSettings()

    expect(within(section).getByText('Needs the installed app')).toBeInTheDocument()
    expect(within(section).getByText('Off')).toBeInTheDocument()
    expect(within(section).queryByRole('button')).not.toBeInTheDocument()
  })

  it('not asked yet: Enable asks, registers this device, then says On', async () => {
    pretendInstalled()
    pretendUserAgent(IPHONE_17)
    const notifications = pretendNotifications('default', 'granted')
    const posted = mockDevices(null, 'd1')
    const push = new FakePushClient({ token: 'tok-1' })
    const section = await openSettings(push)

    expect(await within(section).findByText('Not on yet')).toBeInTheDocument()
    expect(
      within(section).getByText('Tap Enable to get nagged. Without this, rud. is just a list.'),
    ).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Enable notifications' }))

    expect(await within(section).findByText('This device is registered')).toBeInTheDocument()
    expect(within(section).getByText('On')).toBeInTheDocument()
    expect(notifications.asked).toBe(1)
    expect(posted).toEqual([{ fcmToken: 'tok-1', platform: 'ios' }])
    expect(localStorage.getItem('rud.deviceId')).toBe('d1')
  })

  it('a quick double tap asks and registers once', async () => {
    pretendInstalled()
    const notifications = pretendNotifications('default', 'granted')
    const posted = mockDevices(null, 'd1')
    const section = await openSettings()

    const button = await within(section).findByRole('button', { name: 'Enable notifications' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(await within(section).findByText('This device is registered')).toBeInTheDocument()
    expect(notifications.asked).toBe(1)
    expect(posted).toHaveLength(1)
  })

  it('saying no in the prompt: blocked, with the iPhone steps', async () => {
    pretendInstalled()
    pretendUserAgent(IPHONE_17)
    pretendNotifications('default', 'denied')
    const posted = mockDevices(null)
    const push = new FakePushClient()
    const section = await openSettings(push)

    fireEvent.click(await within(section).findByRole('button', { name: 'Enable notifications' }))

    expect(await within(section).findByText('Blocked by iOS')).toBeInTheDocument()
    const steps = within(section).getByRole('heading', { name: 'How to turn on notifications' })
    expect(steps).toBeInTheDocument()
    expect(within(section).getByText('Scroll to', { exact: false })).toHaveTextContent(
      'Scroll to rud.',
    )
    expect(push.getTokenCalls).toBe(0)
    expect(posted).toEqual([])
  })

  it('blocked on Android: the Android steps', async () => {
    pretendInstalled()
    pretendUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141.0 Mobile Safari/537.36')
    pretendNotifications('denied')
    const section = await openSettings()

    expect(await within(section).findByText('Blocked by Android')).toBeInTheDocument()
    expect(within(section).getByText('Apps → rud.')).toBeInTheDocument()
  })

  it('allowed and this device registered: On, and it registers again once per start', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    pretendDeviceId('d1')
    const posted = mockDevices(device('d1'), 'd1')
    const push = new FakePushClient({ token: 'tok-1' })
    const section = await openSettings(push)

    expect(await within(section).findByText('This device is registered')).toBeInTheDocument()
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted).toEqual([{ fcmToken: 'tok-1', platform: 'web' }])
  })

  it('another device took over: says so, no quiet take-back; the button takes it back', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    pretendDeviceId('d1')
    const posted = mockDevices(device('d-other'), 'd2')
    const section = await openSettings()

    expect(await within(section).findByText('Pushes go to another device')).toBeInTheDocument()
    expect(
      within(section).getByText('rud. nags one device at a time, and another one took over.'),
    ).toBeInTheDocument()
    expect(posted).toEqual([])

    fireEvent.click(within(section).getByRole('button', { name: 'Use this device instead' }))

    expect(await within(section).findByText('This device is registered')).toBeInTheDocument()
    expect(
      await screen.findByText(
        'You are now receiving notifications on this device; the previous device has been removed.',
      ),
    ).toBeInTheDocument()
    expect(localStorage.getItem('rud.deviceId')).toBe('d2')
  })

  it('allowed but no device on the API: registers again by itself', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    const posted = mockDevices(null, 'd3')
    const section = await openSettings()

    expect(await within(section).findByText('This device is registered')).toBeInTheDocument()
    expect(posted).toHaveLength(1)
  })

  it('no push token: a toast, and a button to try again', async () => {
    pretendInstalled()
    pretendNotifications('default', 'granted')
    mockDevices(null)
    const section = await openSettings(new FakePushClient({ fails: true }))

    fireEvent.click(await within(section).findByRole('button', { name: 'Enable notifications' }))

    expect(
      await screen.findByText("Couldn't turn on notifications. Try again."),
    ).toBeInTheDocument()
    // Allowed now, but no device: the section offers to register again.
    expect(
      await within(section).findByRole('button', { name: 'Re-register this device' }),
    ).toBeInTheDocument()
    expect(
      within(section).getByText("Registering this device didn't work. Tap below to try again.", {
        exact: false,
      }),
    ).toBeInTheDocument()
  })

  it('a browser without pushes: says so', async () => {
    pretendInstalled()
    pretendNotifications('default')
    const section = await openSettings(new FakePushClient({ supported: false }))

    expect(await within(section).findByText('Not supported in this browser')).toBeInTheDocument()
  })
})
