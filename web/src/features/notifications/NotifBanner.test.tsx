import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { pretendInstalled, pretendNotifications, resetDevice } from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

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

  it('Later hides it until the app starts again', async () => {
    pretendInstalled()
    pretendNotifications('default')
    renderApp('/', new FakeAuthClient(tester))

    fireEvent.click(await screen.findByRole('button', { name: 'Later' }))

    expect(screen.queryByRole('region', { name: 'Turn on notifications' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('rud.notifBannerLater')).toBe('1')
  })

  it('not in a browser tab, and not once notifications were answered', async () => {
    pretendNotifications('default')
    renderApp('/', new FakeAuthClient(tester))
    expect(await screen.findByRole('heading', { name: 'Your reminders' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Turn on notifications' })).not.toBeInTheDocument()
  })
})
