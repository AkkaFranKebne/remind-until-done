import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { FakePushClient } from '../../test-utils/fakePushClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'
import { mockReminders } from '../../test-utils/reminders'

/** The fake API answers DELETE /me with `status`, and counts the calls. */
function mockDelete(status = 204) {
  const calls = { count: 0 }
  server.use(
    http.delete('*/api/v1/me', () => {
      calls.count++
      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json({ error: { code: 'unavailable', message: 'try again' } }, { status })
    }),
  )
  return calls
}

const NOT_INVITED = { error: { code: 'not_invited', message: 'this app is invite-only' } }

async function openSheetFromSettings() {
  fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }))
  return screen.findByRole('alertdialog', { name: 'Delete your account?' })
}

const typeWord = (sheet: HTMLElement, word: string) =>
  fireEvent.change(within(sheet).getByLabelText('Type DELETE'), { target: { value: word } })

const deleteButton = (sheet: HTMLElement) => within(sheet).getByRole('button', { name: 'Delete' })

describe('deleting the account from Settings', () => {
  beforeEach(() => {
    mockMe()
    mockReminders({})
  })

  it('stays locked until DELETE is typed, exactly', async () => {
    const calls = mockDelete()
    renderApp('/settings', new FakeAuthClient(tester))
    const sheet = await openSheetFromSettings()

    expect(deleteButton(sheet)).toBeDisabled()
    typeWord(sheet, 'delete')
    expect(deleteButton(sheet)).toBeDisabled()
    expect(calls.count).toBe(0)

    typeWord(sheet, 'DELETE')
    expect(deleteButton(sheet)).toBeEnabled()
  })

  it('deletes, cleans up this device, signs out and says so once on the login page', async () => {
    const calls = mockDelete()
    const client = new FakeAuthClient(tester)
    const push = new FakePushClient()
    const router = renderApp('/settings', client, push)
    const sheet = await openSheetFromSettings()
    typeWord(sheet, 'DELETE')
    fireEvent.click(deleteButton(sheet))

    expect(await screen.findByText(/Your account was deleted/)).toBeInTheDocument()
    expect(calls.count).toBe(1)
    expect(client.signOutCalls).toBe(1)
    expect(push.deleteTokenCalls).toBe(1)
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
  })

  it('says so even if Firebase has signed out by itself, so no sign-out event comes', async () => {
    mockDelete()
    class QuietClient extends FakeAuthClient {
      override signOut() {
        this.signOutCalls++
        return Promise.resolve()
      }
    }
    renderApp('/settings', new QuietClient(tester))
    const sheet = await openSheetFromSettings()
    typeWord(sheet, 'DELETE')
    fireEvent.click(deleteButton(sheet))

    expect(await screen.findByText(/Your account was deleted/)).toBeInTheDocument()
  })

  it('a failure keeps the sheet and what was typed, and says so', async () => {
    mockDelete(503)
    const client = new FakeAuthClient(tester)
    renderApp('/settings', client)
    const sheet = await openSheetFromSettings()
    typeWord(sheet, 'DELETE')
    fireEvent.click(deleteButton(sheet))

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Try again in a moment.',
    )
    expect(client.signOutCalls).toBe(0)
    expect(within(sheet).getByLabelText('Type DELETE')).toHaveValue('DELETE')
    expect(deleteButton(sheet)).toBeEnabled()
  })

  it('only Cancel closes it, and that forgets what was typed', async () => {
    mockDelete()
    renderApp('/settings', new FakeAuthClient(tester))
    const sheet = await openSheetFromSettings()
    typeWord(sheet, 'DELETE')

    fireEvent.keyDown(sheet, { key: 'Escape' })
    expect(screen.getByRole('alertdialog', { name: 'Delete your account?' })).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    const again = await openSheetFromSettings()
    expect(within(again).getByLabelText('Type DELETE')).toHaveValue('')
  })
})

describe('the invite-only screen (decision 79)', () => {
  beforeEach(() => mockMe(403, NOT_INVITED))

  it('keeps the sign-in, and Sign out lets someone try another account', async () => {
    const client = new FakeAuthClient(tester)
    const push = new FakePushClient()
    renderApp('/login', client, push)

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(client.signOutCalls).toBe(1)
    expect(push.deleteTokenCalls).toBe(1) // or a removed person's phone keeps showing nags
    expect(screen.queryByRole('heading', { name: 'This app is invite-only.' })).toBeNull()
  })

  it.each(['/settings', '/'])(
    'a signed-in page (%s) goes to the invite-only screen',
    async (path) => {
      const router = renderApp(path, new FakeAuthClient(tester))

      expect(
        await screen.findByRole('heading', { name: 'This app is invite-only.' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(screen.queryByRole('heading', { name: 'Your reminders' })).toBeNull()
    },
  )

  it('can delete the account', async () => {
    const calls = mockDelete()
    const client = new FakeAuthClient(tester)
    renderApp('/login', client)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }))
    const sheet = await screen.findByRole('alertdialog', { name: 'Delete your account?' })
    typeWord(sheet, 'DELETE')
    fireEvent.click(deleteButton(sheet))

    expect(await screen.findByText(/Your account was deleted/)).toBeInTheDocument()
    expect(calls.count).toBe(1)
    expect(client.signOutCalls).toBe(1)
    expect(screen.queryByRole('heading', { name: 'This app is invite-only.' })).toBeNull()
  })
})
