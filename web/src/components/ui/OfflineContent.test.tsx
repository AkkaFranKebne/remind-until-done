import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { OfflineContent } from './OfflineContent'

const serverAnswers = () => server.use(http.get('*/api/v1/healthz', () => HttpResponse.json({})))
const serverSilent = () => server.use(http.get('*/api/v1/healthz', () => HttpResponse.error()))

function renderContent(onBack = jest.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OfflineContent onBack={onBack} />
    </QueryClientProvider>,
  )
  return onBack
}

beforeEach(() => onlineManager.setOnline(false))

test('says so, in the Inventory copy', () => {
  serverSilent()
  renderContent()
  expect(screen.getByRole('heading', { name: "You're completely offline." })).toBeInTheDocument()
  expect(
    screen.getByText(
      "No connection, no cache, no rud. Even we can't nag you without the internet.",
    ),
  ).toBeInTheDocument()
})

test('Try again: still no server, still offline', async () => {
  serverSilent()
  const onBack = renderContent()

  const button = screen.getByRole('button', { name: 'Try again' })
  fireEvent.click(button)

  await waitFor(() => expect(button).toBeEnabled())
  await waitFor(() => expect(button).not.toHaveAttribute('aria-busy', 'true'))
  expect(onlineManager.isOnline()).toBe(false)
  expect(onBack).not.toHaveBeenCalled()
})

test('checks at once: one failed request may have been a blip', async () => {
  serverAnswers()
  const onBack = renderContent()
  await waitFor(() => expect(onBack).toHaveBeenCalled())
  expect(onlineManager.isOnline()).toBe(true)
})

test('Try again: the server answers, so we are back', async () => {
  serverAnswers()
  const onBack = renderContent()

  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(onlineManager.isOnline()).toBe(true))
  expect(onBack).toHaveBeenCalled()
})

test('the browser saying we are back is enough', () => {
  serverSilent()
  const onBack = renderContent()

  act(() => onlineManager.setOnline(true))

  expect(onBack).toHaveBeenCalled()
})

test('looks by itself every so often, for when the browser never says', async () => {
  serverSilent()
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] })
  try {
    renderContent()
    await act(() => jest.advanceTimersByTimeAsync(1000))
    expect(onlineManager.isOnline()).toBe(false)
    serverAnswers()
    await act(() => jest.advanceTimersByTimeAsync(15_000))
    jest.useRealTimers()
    await waitFor(() => expect(onlineManager.isOnline()).toBe(true))
  } finally {
    jest.useRealTimers()
  }
})

test('an automatic check leaves Try again alone, and it can still be tapped', async () => {
  let asked = 0
  server.use(
    http.get('*/api/v1/healthz', async () => {
      asked++
      await new Promise(() => {}) // no answer: the check stays running
      return HttpResponse.error()
    }),
  )
  renderContent()

  const button = screen.getByRole('button', { name: 'Try again' })
  await waitFor(() => expect(asked).toBe(1))
  expect(button).not.toHaveAttribute('aria-busy', 'true')
  expect(button).toBeEnabled()

  fireEvent.click(button)
  await waitFor(() => expect(asked).toBe(2))
  expect(button).toHaveAttribute('aria-busy', 'true')
})

test('takes focus so a screen reader says so, and gives it back', () => {
  serverSilent()
  const link = document.createElement('a')
  link.href = '#'
  document.body.append(link)
  link.focus()

  const { unmount } = render(
    <QueryClientProvider client={new QueryClient()}>
      <OfflineContent />
    </QueryClientProvider>,
  )
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()

  unmount()
  expect(link).toHaveFocus()
  link.remove()
})

test('leaves focus in an open sheet', () => {
  serverSilent()
  const sheet = document.createElement('div')
  sheet.setAttribute('role', 'dialog')
  const field = document.createElement('input')
  sheet.append(field)
  document.body.append(sheet)
  field.focus()

  renderContent()

  expect(field).toHaveFocus()
  sheet.remove()
})

test('puts the scroll position back afterwards', () => {
  serverSilent()
  window.scrollY = 300
  const scrollTo = jest.mocked(window.scrollTo)
  scrollTo.mockClear()

  const { unmount } = render(
    <QueryClientProvider client={new QueryClient()}>
      <OfflineContent />
    </QueryClientProvider>,
  )
  unmount()

  expect(scrollTo).toHaveBeenCalledWith(0, 300)
  window.scrollY = 0
})
