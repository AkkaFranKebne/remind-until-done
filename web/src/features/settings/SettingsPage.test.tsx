import { fireEvent, screen, waitFor } from '@testing-library/react'
import { ewa, FakeAuthClient } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'

describe('SettingsPage', () => {
  beforeEach(() => mockMe())

  it('shows who is signed in', async () => {
    renderApp('/settings', new FakeAuthClient(ewa))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Ewa')).toBeInTheDocument()
    expect(screen.getByText('ewa.wrobel@gmail.com')).toBeInTheDocument()
  })

  it('falls back to the email when Google has no name', async () => {
    renderApp('/settings', new FakeAuthClient({ email: 'ewa.wrobel@gmail.com', name: null }))

    expect(await screen.findAllByText('ewa.wrobel@gmail.com')).toHaveLength(2)
  })

  it('Sign out asks first, then signs out and goes to /login', async () => {
    const client = new FakeAuthClient(ewa)
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
    const client = new FakeAuthClient(ewa)
    renderApp('/settings', client)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(client.signOutCalls).toBe(0)
  })
})
