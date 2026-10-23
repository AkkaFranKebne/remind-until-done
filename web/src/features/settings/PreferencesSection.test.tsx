import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp, testMe } from '../../test-utils/renderApp'

/** PATCH /me bodies with a preference in them (the time zone sync sends its own). */
function recordPatches(answer: 'ok' | 'refuse' = 'ok') {
  const patches: unknown[] = []
  server.use(
    http.patch('*/api/v1/me', async ({ request }) => {
      const body: unknown = await request.json()
      const fields = typeof body === 'object' && body !== null ? body : {}
      const preference = !('timezone' in fields)
      if (preference) patches.push(fields)
      if (answer === 'refuse' && preference) {
        return HttpResponse.json(
          { error: { code: 'validation_failed', message: 'No' } },
          { status: 400 },
        )
      }
      return HttpResponse.json({ ...testMe, ...fields })
    }),
  )
  return patches
}

async function openPreferences() {
  renderApp('/settings', new FakeAuthClient(tester))
  const heading = await screen.findByRole('heading', { level: 2, name: 'Preferences' })
  const section = heading.closest('section')
  if (!section) throw new Error('no Preferences section')
  return section
}

describe('Settings → Preferences', () => {
  beforeEach(() => mockMe())

  it('shows the defaults and the time zone', async () => {
    const section = await openPreferences()

    const interval = within(section).getByRole('radiogroup', { name: 'Default nag interval' })
    expect(within(interval).getByRole('radio', { name: '1 h' })).toBeChecked()
    expect(within(section).getByLabelText('Default time')).toHaveValue('09:00')
    // The phone's zone wins (design doc 5.6): Jest runs in UTC, so the sync PATCH set it.
    expect(await within(section).findByText('UTC')).toBeInTheDocument()
  })

  it('a new interval is saved at once, with a toast', async () => {
    const patches = recordPatches()
    const section = await openPreferences()

    fireEvent.click(within(section).getByRole('radio', { name: '4 h' }))

    await waitFor(() => expect(within(section).getByRole('radio', { name: '4 h' })).toBeChecked())
    expect(await screen.findByText('Noted.')).toBeInTheDocument()
    expect(patches).toEqual([{ defaultNagIntervalMin: 240 }])
  })

  it('the API refuses: the old interval comes back, with a toast', async () => {
    recordPatches('refuse')
    const section = await openPreferences()

    fireEvent.click(within(section).getByRole('radio', { name: '4 h' }))

    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    expect(within(section).getByRole('radio', { name: '1 h' })).toBeChecked()
  })

  it('the default time is saved when the picker closes, not while turning', async () => {
    const patches = recordPatches()
    const section = await openPreferences()
    const time = within(section).getByLabelText('Default time')

    fireEvent.change(time, { target: { value: '08:30' } })
    expect(patches).toEqual([])
    fireEvent.blur(time)

    await waitFor(() => expect(patches).toEqual([{ defaultTimeOfDay: '08:30' }]))
    expect(await screen.findByText('Noted.')).toBeInTheDocument()
    expect(within(section).getByLabelText('Default time')).toHaveValue('08:30')
  })

  it('an emptied or unchanged time is not sent', async () => {
    const patches = recordPatches()
    const section = await openPreferences()
    const time = within(section).getByLabelText('Default time')

    fireEvent.change(time, { target: { value: '' } })
    fireEvent.blur(time)
    expect(time).toHaveValue('09:00')
    fireEvent.blur(time)

    expect(patches).toEqual([])
  })

  it('the Add sheet uses the new default time', async () => {
    recordPatches()
    const section = await openPreferences()
    const time = within(section).getByLabelText('Default time')
    fireEvent.change(time, { target: { value: '07:45' } })
    fireEvent.blur(time)
    await screen.findByText('Noted.')

    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    fireEvent.click(await screen.findByRole('button', { name: /add/i }))

    expect(await screen.findByRole('radio', { name: 'Tomorrow 07:45' })).toBeInTheDocument()
  })
})
