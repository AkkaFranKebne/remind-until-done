import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { pretendInstalled, pretendNotifications, resetDevice } from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

const HOUR = 60 * 60 * 1000

const banner = () => screen.findByRole('region', { name: 'Turn on notifications' })

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
})
