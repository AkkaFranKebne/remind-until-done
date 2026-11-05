import { onlineManager } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { FakeAuthClient, tester } from '../../test-utils/fakeAuthClient'
import { mockMe, renderApp } from '../../test-utils/renderApp'
import { mockReminders } from '../../test-utils/reminders'

const OFFLINE = { name: "You're completely offline." }

describe('losing the connection while using the app', () => {
  beforeEach(() => {
    mockMe()
    mockReminders({})
  })

  it('the top bar stays, the message takes the content, and it goes away by itself', async () => {
    server.use(http.get('*/api/v1/healthz', () => HttpResponse.error()))
    renderApp('/settings', new FakeAuthClient(tester))
    await screen.findByRole('heading', { name: 'Settings' })

    act(() => onlineManager.setOnline(false))

    expect(screen.getByRole('heading', OFFLINE)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /rud/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull()

    act(() => onlineManager.setOnline(true))

    expect(screen.queryByRole('heading', OFFLINE)).toBeNull()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
  })
})

describe('opening the app with no connection', () => {
  it('the browser already says offline: it shows the message, not the splash forever', async () => {
    onlineManager.setOnline(false)
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.error()),
      http.get('*/api/v1/healthz', () => HttpResponse.error()),
    )
    renderApp('/', new FakeAuthClient(tester))

    expect(await screen.findByRole('heading', OFFLINE)).toBeInTheDocument()
  })

  it('keeps the session and the page, and goes on when the connection is back', async () => {
    let up = false
    server.use(
      http.get('*/api/v1/me', () => (up ? HttpResponse.json(meBody) : HttpResponse.error())),
      http.get('*/api/v1/healthz', () => (up ? HttpResponse.json({}) : HttpResponse.error())),
    )
    mockReminders({})
    const client = new FakeAuthClient(tester)
    const router = renderApp('/settings', client)

    expect(await screen.findByRole('heading', OFFLINE)).toBeInTheDocument()
    expect(client.signOutCalls).toBe(0)
    expect(router.state.location.pathname).toBe('/settings')

    up = true
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    await waitFor(() => expect(onlineManager.isOnline()).toBe(true))
  })
})

const meBody = {
  id: 'u1',
  email: 'tester@example.com',
  timezone: 'Europe/Stockholm',
  defaultTimeOfDay: '09:00',
  defaultNagIntervalMin: 60,
}
