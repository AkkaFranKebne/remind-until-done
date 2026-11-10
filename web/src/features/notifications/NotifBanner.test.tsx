import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import type { Device } from '../../lib/api/generated/model'
import {
  pretendDeviceId,
  pretendInstalled,
  pretendNotifications,
  resetDevice,
} from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { FakePushClient } from '../../test-utils/fakePushClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

const HOUR = 60 * 60 * 1000

const banner = () => screen.findByRole('region', { name: 'Turn on notifications' })

const device = (id: string): Device => ({
  id,
  platform: 'web',
  userAgent: null,
  createdAt: '2026-10-21T08:00:00Z',
  lastSeenAt: '2026-10-21T08:00:00Z',
})

/** The fake API's device: `registered` at first; POST makes this one `newId`. */
function mockDevices(registered: Device | null, newId = 'd-new') {
  let current = registered
  let posts = 0
  server.use(
    http.get('*/api/v1/devices', () => HttpResponse.json({ items: current ? [current] : [] })),
    http.post('*/api/v1/devices', () => {
      posts += 1
      current = device(newId)
      return HttpResponse.json(current)
    }),
  )
  return { posts: () => posts }
}

describe('NotifBanner (the list)', () => {
  beforeEach(() => mockMe())
  afterEach(resetDevice)

  it('installed, not asked yet: the banner; Enable turns notifications on and it goes', async () => {
    pretendInstalled()
    const notifications = pretendNotifications('default', 'granted')
    server.use(
      http.post('*/api/v1/devices', () =>
        HttpResponse.json({
          id: 'd1',
          platform: 'web',
          userAgent: null,
          createdAt: '2026-10-21T08:00:00Z',
          lastSeenAt: '2026-10-21T08:00:00Z',
        }),
      ),
    )
    renderApp('/', new FakeAuthClient(tester))

    expect(await banner()).toHaveTextContent('Enable notifications so we can nag you.')
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Turn on notifications' }),
      ).not.toBeInTheDocument(),
    )
    expect(notifications.asked).toBe(1)
  })

  it('while turning on, Enable keeps its name and focus, and says it is busy', async () => {
    pretendInstalled()
    pretendNotifications('default', 'granted')
    let answer: () => void = () => {}
    server.use(
      http.post(
        '*/api/v1/devices',
        () =>
          new Promise<Response>((resolve) => {
            answer = () =>
              resolve(
                HttpResponse.json({
                  id: 'd1',
                  platform: 'web',
                  userAgent: null,
                  createdAt: '2026-10-21T08:00:00Z',
                  lastSeenAt: '2026-10-21T08:00:00Z',
                }),
              )
          }),
      ),
    )
    renderApp('/', new FakeAuthClient(tester))
    await banner()
    const enable = screen.getByRole('button', { name: 'Enable' })
    enable.focus()

    fireEvent.click(enable)

    await waitFor(() => expect(enable).toHaveAttribute('aria-busy', 'true'))
    expect(enable).toHaveAccessibleName('Enable')
    expect(enable).toHaveFocus()
    answer()
  })

  it('not while the app registers by itself at start (already allowed)', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    renderApp('/', new FakeAuthClient(tester))
    expect(await screen.findByRole('heading', { name: 'Your reminders' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Turn on notifications' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('Later hides it for a day', async () => {
    pretendInstalled()
    pretendNotifications('default')
    renderApp('/', new FakeAuthClient(tester))

    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))

    expect(screen.queryByRole('region', { name: 'Turn on notifications' })).not.toBeInTheDocument()
    const tapped = Number(localStorage.getItem('rud.notifBannerLater'))
    expect(Date.now() - tapped).toBeLessThan(1000)
  })

  it('Later from under a day ago: still hidden', async () => {
    pretendInstalled()
    pretendNotifications('default')
    localStorage.setItem('rud.notifBannerLater', String(Date.now() - 23 * HOUR))
    renderApp('/', new FakeAuthClient(tester))

    expect(await screen.findByRole('heading', { name: 'Your reminders' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })

  it('Later from over a day ago: back', async () => {
    pretendInstalled()
    pretendNotifications('default')
    localStorage.setItem('rud.notifBannerLater', String(Date.now() - 25 * HOUR))
    renderApp('/', new FakeAuthClient(tester))

    expect(await banner()).toBeInTheDocument()
  })

  it('blocked: says so, and Show me opens Settings with the steps', async () => {
    pretendInstalled()
    pretendNotifications('denied')
    renderApp('/', new FakeAuthClient(tester))

    const blocked = await screen.findByRole('region', { name: 'Notifications are blocked' })
    expect(blocked).toHaveTextContent("Notifications are blocked. Here's how to fix it.")
    expect(screen.queryByRole('button', { name: 'Enable' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Show me' }))

    expect(
      await screen.findByRole('heading', { name: 'How to turn on notifications' }),
    ).toBeInTheDocument()
  })

  it('blocked: Later hides it too', async () => {
    pretendInstalled()
    pretendNotifications('denied')
    renderApp('/', new FakeAuthClient(tester))
    await screen.findByRole('region', { name: 'Notifications are blocked' })

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))

    expect(
      screen.queryByRole('region', { name: 'Notifications are blocked' }),
    ).not.toBeInTheDocument()
  })

  it('saying no in the prompt: the Enable banner turns into the blocked one', async () => {
    pretendInstalled()
    pretendNotifications('default', 'denied')
    renderApp('/', new FakeAuthClient(tester))
    await banner()

    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))

    expect(
      await screen.findByRole('region', { name: 'Notifications are blocked' }),
    ).toBeInTheDocument()
  })

  it('not in a browser tab', async () => {
    pretendNotifications('default')
    renderApp('/', new FakeAuthClient(tester))
    expect(await screen.findByRole('heading', { name: 'Your reminders' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })

  it('another device has the pushes: says so, and Use this device takes them back here', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    pretendDeviceId('d1')
    const api = mockDevices(device('d-other'), 'd2')
    renderApp('/', new FakeAuthClient(tester))

    const warning = await screen.findByRole('region', { name: 'Pushes go to another device' })
    expect(warning).toHaveTextContent("Pushes won't reach you here.")
    expect(api.posts()).toBe(0) // never taken back without the tap

    fireEvent.click(screen.getByRole('button', { name: 'Use this device' }))

    expect(
      await screen.findByText(
        'You are now receiving notifications on this device; the previous device has been removed.',
      ),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Pushes go to another device' }),
      ).not.toBeInTheDocument(),
    )
    expect(localStorage.getItem('rud.deviceId')).toBe('d2')
  })

  it('another device has the pushes: Later hides it for a day', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    pretendDeviceId('d1')
    mockDevices(device('d-other'))
    renderApp('/', new FakeAuthClient(tester))
    await screen.findByRole('region', { name: 'Pushes go to another device' })

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))

    expect(
      screen.queryByRole('region', { name: 'Pushes go to another device' }),
    ).not.toBeInTheDocument()
  })

  it('signed in again with no device: no flash of the warning while the app registers itself', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    mockDevices(null)
    const seen: string[] = []
    // Every banner ever added, even one removed again before anyone looks.
    const watch = new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.addedNodes) {
          if (!(node instanceof Element)) continue
          for (const region of [node, ...node.querySelectorAll('section[aria-label]')]) {
            const name = region.getAttribute('aria-label')
            if (name) seen.push(name)
          }
        }
      }
    })
    watch.observe(document.body, { childList: true, subtree: true })
    renderApp('/', new FakeAuthClient(tester))

    await waitFor(() => expect(localStorage.getItem('rud.deviceId')).toBe('d-new'))
    watch.disconnect()
    expect(seen).not.toContain('No device registered')
  })

  it('registering this device failed: says so, and Re-register tries again', async () => {
    pretendInstalled()
    pretendNotifications('granted')
    mockDevices(null)
    const token = { fails: true } // token requests fail until the test flips this
    renderApp('/', new FakeAuthClient(tester), new FakePushClient(token))

    const warning = await screen.findByRole('region', { name: 'No device registered' })
    expect(warning).toHaveTextContent("Pushes won't reach you.")

    token.fails = false
    fireEvent.click(screen.getByRole('button', { name: 'Re-register' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'No device registered' }),
      ).not.toBeInTheDocument(),
    )
  })
})
