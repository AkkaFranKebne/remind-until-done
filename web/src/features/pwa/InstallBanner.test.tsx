import { fireEvent, screen, within } from '@testing-library/react'
import {
  offerInstall,
  pretendAppFound,
  pretendInstalled,
  pretendNotifications,
  resetDevice,
} from '../../test-utils/device'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

const DAY = 24 * 60 * 60 * 1000
const KEY = 'rud.installBannerDismissed'
const name = 'Install the app'

async function openList() {
  renderApp('/', new FakeAuthClient(tester))
  expect(await screen.findByRole('heading', { name: 'Your reminders' })).toBeInTheDocument()
}

describe('InstallBanner (the list, in a browser tab)', () => {
  beforeEach(() => mockMe())
  afterEach(() => {
    resetDevice()
    localStorage.removeItem(KEY)
  })

  it('Chrome offers: Install opens its dialog, then says where the app is', async () => {
    const event = offerInstall('accepted')
    await openList()

    const banner = screen.getByRole('region', { name })
    expect(banner).toHaveTextContent('Install rud. to get push notifications')
    expect(banner.querySelector('.lucide-download')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    expect(
      await screen.findByText('Installed. Open rud. from your home screen.'),
    ).toBeInTheDocument()
    expect(event.prompted).toBe(1)
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
    // Announced (a status), and focus lands on ✕ instead of the page.
    expect(within(banner).getByRole('status')).toHaveTextContent('Installed.')
    expect(screen.getByRole('button', { name: 'Hide for a week' })).toHaveFocus()
  })

  it('the app is already installed: says to open it, no button', async () => {
    await pretendAppFound()
    await openList()

    expect(screen.getByRole('region', { name })).toHaveTextContent(
      'rud. is installed. Open it from your apps for notifications.',
    )
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
    // Nothing to download here: the app-window icon, not the download arrow.
    const banner = screen.getByRole('region', { name })
    expect(banner.querySelector('.lucide-app-window')).toBeInTheDocument()
    expect(banner.querySelector('.lucide-download')).not.toBeInTheDocument()
  })

  it('no install offer (Firefox, Safari, a dismissed offer): says the app is needed', async () => {
    await openList()

    const banner = screen.getByRole('region', { name })
    expect(banner).toHaveTextContent(
      'Push notifications need the installed app. Already installed? Open rud. from your apps.',
    )
    expect(banner.querySelector('.lucide-app-window')).toBeInTheDocument()
  })

  it('✕ hides it for 7 days', async () => {
    await openList()

    fireEvent.click(screen.getByRole('button', { name: 'Hide for a week' }))

    expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
    expect(Date.now() - Number(localStorage.getItem(KEY))).toBeLessThan(1000)
  })

  it('hidden 6 days ago: still hidden', async () => {
    localStorage.setItem(KEY, String(Date.now() - 6 * DAY))
    await openList()

    expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
  })

  it('hidden 8 days ago: back', async () => {
    localStorage.setItem(KEY, String(Date.now() - 8 * DAY))
    await openList()

    expect(screen.getByRole('region', { name })).toBeInTheDocument()
  })

  it('not in the installed app (one banner at a time: that one is about notifications)', async () => {
    pretendInstalled()
    pretendNotifications('default')
    await openList()

    expect(await screen.findByRole('region', { name: 'Turn on notifications' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name })).not.toBeInTheDocument()
  })
})
