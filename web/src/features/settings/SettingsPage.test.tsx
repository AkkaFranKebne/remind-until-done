import { fireEvent, screen, waitFor } from '@testing-library/react'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

describe('SettingsPage', () => {
  beforeEach(() => mockMe())

  it('shows who is signed in', async () => {
    renderApp('/settings', new FakeAuthClient(tester))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Tess')).toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
  })

  it('falls back to the email when Google has no name', async () => {
    renderApp('/settings', new FakeAuthClient({ email: 'tester@example.com', name: null }))

    expect(await screen.findAllByText('tester@example.com')).toHaveLength(2)
  })

  it('Sign out asks first, then signs out and goes to /login', async () => {
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    const sheet = await screen.findByRole('alertdialog', { name: 'Sign out?' })
    expect(sheet).toHaveTextContent(
      "You'll need to reinstall the app to sign back in on this device.",
    )
    expect(client.signOutCalls).toBe(0)

    const confirm = screen
      .getAllByRole('button', { name: 'Sign out' })
      .find((b) => sheet.contains(b))
    fireEvent.click(confirm!)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(client.signOutCalls).toBe(1)
  })

  it('Cancel keeps you signed in', async () => {
    const client = new FakeAuthClient(tester)
    renderApp('/settings', client)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(client.signOutCalls).toBe(0)
  })
})
