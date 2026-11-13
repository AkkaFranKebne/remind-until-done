import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { CreateReminder } from '../../lib/api/generated/model'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { aReminder, mockReminders } from '../../test-utils/reminders'
import { mockMe, renderApp } from '../../test-utils/renderApp'
import { titleExamples } from './addReminderForm'

/** Only the clock is fake (timers, promises and MSW stay real): a fixed "now" for the chip labels. */
function pretendNow(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'queueMicrotask',
      'nextTick',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
      'performance',
    ],
  })
}

beforeEach(() => {
  mockMe() // default time 09:00
  pretendNow('2026-10-14T10:00:00Z') // after 09:00: the chip says "Tomorrow 09:00"
})
afterEach(() => {
  Reflect.deleteProperty(HTMLInputElement.prototype, 'showPicker')
  jest.useRealTimers()
})

/** The invisible native picker over "Custom…", found by its name like a screen reader would. */
function picker(sheet: HTMLElement) {
  const input = within(sheet).getByLabelText('Pick a custom date and time')
  if (!(input instanceof HTMLInputElement)) throw new Error('no date-time picker')
  return input
}

/** "YYYY-MM-DDTHH:MM" in the phone's zone, `days` from now. */
function localValue(days: number, time: string) {
  const d = new Date(Date.now() + days * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`
}

function isCreateReminder(v: unknown): v is CreateReminder {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof Reflect.get(v, 'title') === 'string' &&
    typeof Reflect.get(v, 'dueAt') === 'string'
  )
}

/** Records what the app sends to POST /reminders, and answers with `status`. */
function mockCreate(status = 201, errorCode?: string) {
  const sent: CreateReminder[] = []
  server.use(
    http.post('*/api/v1/reminders', async ({ request }) => {
      const body: unknown = await request.json()
      if (!isCreateReminder(body)) throw new Error(`not a CreateReminder: ${JSON.stringify(body)}`)
      sent.push(body)
      return status === 201
        ? HttpResponse.json(aReminder({ title: body.title, dueAt: body.dueAt }), { status })
        : HttpResponse.json({ error: { code: errorCode ?? 'internal', message: 'x' } }, { status })
    }),
  )
  return sent
}

async function openSheet() {
  renderApp('/', new FakeAuthClient(tester))
  fireEvent.click(await screen.findByRole('button', { name: 'Add reminder' }))
  return screen.findByRole('dialog', { name: 'Set the trap' })
}

const typeTitle = (sheet: HTMLElement, text: string) =>
  fireEvent.change(within(sheet).getByRole('textbox', { name: 'What are you forgetting?' }), {
    target: { value: text },
  })

test('opens with the questions from the Inventory; "Tomorrow <default time>" and your default interval (1 h) are picked', async () => {
  const sheet = await openSheet()

  expect(
    within(sheet).getByRole('textbox', { name: 'What are you forgetting?' }),
  ).toBeInTheDocument()
  expect(
    within(sheet).getByRole('radiogroup', { name: 'When should we start?' }),
  ).toBeInTheDocument()
  expect(within(sheet).getByRole('radio', { name: 'Tomorrow 09:00' })).toBeChecked()
  expect(within(sheet).getByRole('radio', { name: '1 h' })).toBeChecked()
  expect(within(sheet).getByRole('radio', { name: 'In 1 h' })).not.toBeChecked()
  expect(within(sheet).getByRole('radio', { name: '15 min' })).toBeInTheDocument()
})

test('before the default time: "Today 09:00", and it saves today at 09:00', async () => {
  pretendNow('2026-10-14T08:15:00Z')
  const sent = mockCreate()
  const sheet = await openSheet()

  expect(within(sheet).getByRole('radio', { name: 'Today 09:00' })).toBeChecked()
  typeTitle(sheet, 'Call mum')
  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))

  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]?.dueAt).toBe('2026-10-14T09:00:00.000Z')
})

test('sending empty shows what is missing, inline', async () => {
  const sent = mockCreate()
  const sheet = await openSheet()

  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))

  expect(await within(sheet).findByText('Title is required')).toBeInTheDocument()
  expect(sent).toHaveLength(0)
})

test('an error moves focus to the first field that needs fixing (so it is in view)', async () => {
  mockCreate()
  const sheet = await openSheet()

  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))
  await waitFor(() =>
    expect(within(sheet).getByRole('textbox', { name: 'What are you forgetting?' })).toHaveFocus(),
  )

  // A custom time in the past: the picker is hidden, so focus goes to the picked chip.
  typeTitle(sheet, 'Call mum')
  fireEvent.change(picker(sheet), { target: { value: localValue(-1, '08:00') } })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))
  const when = within(sheet).getByRole('radiogroup', { name: 'When should we start?' })
  await waitFor(() => expect(within(when).getByRole('radio', { checked: true })).toHaveFocus())
  expect(within(sheet).getByText('That time has already passed.')).toBeInTheDocument()
})

test('creates the reminder, closes, and the list reloads with it', async () => {
  const sent = mockCreate()
  const sheet = await openSheet()

  typeTitle(sheet, '  File tax return ')
  fireEvent.click(within(sheet).getByRole('radio', { name: 'In 1 h' }))
  fireEvent.click(within(sheet).getByRole('radio', { name: '30 min' }))
  mockReminders({ upcoming: [aReminder({ title: 'File tax return' })] })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))

  await waitFor(() => expect(sent).toHaveLength(1))
  expect(sent[0]).toMatchObject({ title: 'File tax return', note: null, nagIntervalMin: 30 })
  const due = new Date(sent[0]?.dueAt ?? '').getTime()
  expect(due).toBeGreaterThan(Date.now() + 58 * 60_000)
  expect(due).toBeLessThan(Date.now() + 61 * 60_000)

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Set the trap' })).not.toBeInTheDocument(),
  )
  expect(await screen.findByRole('link', { name: /File tax return/ })).toBeInTheDocument()
})

test('"Add a note" shows the note with its counter; over 200 characters is refused', async () => {
  const sent = mockCreate()
  const sheet = await openSheet()

  fireEvent.click(within(sheet).getByRole('button', { name: 'Add a note' }))
  const note = await within(sheet).findByRole('textbox', { name: 'Note · optional' })
  fireEvent.change(note, { target: { value: 'x'.repeat(201) } })
  typeTitle(sheet, 'Call mum')
  fireEvent.click(within(sheet).getByRole('radio', { name: 'In 3 h' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))

  expect(await within(sheet).findByText(/It's a reminder, not a diary/)).toBeInTheDocument()
  expect(within(sheet).getByText('201 / 200')).toBeInTheDocument()
  expect(sent).toHaveLength(0)
})

test('closing with something typed asks first: Keep editing stays, Discard closes', async () => {
  const sheet = await openSheet()
  typeTitle(sheet, 'Half a thought')

  fireEvent.keyDown(sheet, { key: 'Escape' })
  const ask = await screen.findByRole('alertdialog', { name: 'Forget this one?' })
  fireEvent.click(within(ask).getByRole('button', { name: 'Keep editing' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(screen.getByRole('textbox', { name: 'What are you forgetting?' })).toHaveValue(
    'Half a thought',
  )

  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Set the trap' }), { key: 'Escape' })
  fireEvent.click(await screen.findByRole('button', { name: 'Discard' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Set the trap' })).not.toBeInTheDocument(),
  )
})

test('an empty sheet closes at once, without asking', async () => {
  const sheet = await openSheet()

  fireEvent.keyDown(sheet, { key: 'Escape' })

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Set the trap' })).not.toBeInTheDocument(),
  )
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('at the limit the API says 409: the sheet says so and stays open', async () => {
  mockCreate(409, 'limit_reached')
  const sheet = await openSheet()

  typeTitle(sheet, 'Sixth')
  fireEvent.click(within(sheet).getByRole('radio', { name: 'In 1 h' }))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))

  expect(await within(sheet).findByRole('alert')).toHaveTextContent(
    "You've hit 5 active reminders.",
  )
})

test('Custom… opens the native picker at once; the chip is picked only once a time is chosen', async () => {
  // jsdom has no showPicker: give the test one.
  const showPicker = jest.fn()
  Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
    value: showPicker,
    configurable: true,
  })
  const sent = mockCreate()
  const sheet = await openSheet()

  fireEvent.click(within(sheet).getByRole('radio', { name: 'Custom…' }))
  expect(showPicker).toHaveBeenCalledTimes(1)
  // Nothing chosen yet (or the picker was cancelled): "Tomorrow 09:00" stays picked.
  expect(within(sheet).getByRole('radio', { name: 'Tomorrow 09:00' })).toBeChecked()

  // The picker's Reset (empty value) counts as a cancel too.
  fireEvent.change(picker(sheet), { target: { value: '' } })
  expect(within(sheet).getByRole('radio', { name: 'Tomorrow 09:00' })).toBeChecked()

  const value = localValue(1, '14:30')
  fireEvent.change(picker(sheet), { target: { value } })
  // Closing the picker puts focus back on the picked chip (the picker itself is hidden).
  fireEvent.blur(picker(sheet))
  await waitFor(() =>
    expect(within(sheet).getByRole('radio', { name: 'Tomorrow 14:30' })).toHaveFocus(),
  )

  expect(await within(sheet).findByRole('radio', { name: 'Tomorrow 14:30' })).toBeChecked()

  typeTitle(sheet, 'Dentist')
  fireEvent.click(within(sheet).getByRole('button', { name: 'Start nagging me' }))
  await waitFor(() => expect(sent).toHaveLength(1))
  expect(new Date(sent[0]?.dueAt ?? '').toISOString()).toBe(new Date(value).toISOString())
})

test('a tap on Custom… lands on the date input laid over it (iPhone opens its picker there)', async () => {
  const showPicker = jest.fn()
  Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
    value: showPicker,
    configurable: true,
  })
  const sheet = await openSheet()

  // The input covers the chip: they share one box (iPhone ignores showPicker on a hidden input).
  const chip = within(sheet).getByRole('radio', { name: 'Custom…' })
  expect(picker(sheet).parentElement).toBe(chip.parentElement)
  expect(picker(sheet)).toHaveClass('absolute', 'inset-0', 'opacity-0')

  // A computer: a click on the input asks for the picker too.
  fireEvent.click(picker(sheet))
  expect(showPicker).toHaveBeenCalledTimes(1)

  fireEvent.change(picker(sheet), { target: { value: localValue(1, '14:30') } })
  expect(await within(sheet).findByRole('radio', { name: 'Tomorrow 14:30' })).toBeChecked()
})

test('on a touch screen, activating the Custom… chip also focuses the date input (VoiceOver path)', async () => {
  Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
    value: jest.fn(),
    configurable: true,
  })
  // jsdom has no matchMedia: a phone (touch screen) for this test.
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    configurable: true,
  })
  try {
    const sheet = await openSheet()

    fireEvent.click(within(sheet).getByRole('radio', { name: 'Custom…' }))

    expect(picker(sheet)).toHaveFocus()
  } finally {
    Reflect.deleteProperty(window, 'matchMedia')
  }
})

test('the title example changes every time the sheet is closed and opened again', async () => {
  const sheet = await openSheet()
  const title = () =>
    within(screen.getByRole('dialog', { name: 'Set the trap' })).getByRole('textbox', {
      name: 'What are you forgetting?',
    })
  const first = title().getAttribute('placeholder')
  expect(titleExamples).toContain(first)

  fireEvent.keyDown(sheet, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }))
  await screen.findByRole('dialog', { name: 'Set the trap' })

  const second = title().getAttribute('placeholder')
  expect(titleExamples).toContain(second)
  expect(second).not.toBe(first)
})
