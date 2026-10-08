import { render, screen } from '@testing-library/react'
import { ApiStatus } from './ApiStatus'

function mockFetch(response: Partial<Response>) {
  globalThis.fetch = jest.fn().mockResolvedValue(response)
}

afterEach(() => {
  jest.restoreAllMocks()
})

test('shows the API status when the health check succeeds', async () => {
  mockFetch({ ok: true, json: async () => ({ status: 'ok' }) })

  render(<ApiStatus />)

  expect(screen.getByText('Checking the API…')).toBeInTheDocument()
  expect(await screen.findByText('API: ok')).toBeInTheDocument()
  expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/healthz')
})

test('shows an error when the API answers with an error status', async () => {
  mockFetch({ ok: false, status: 502 })

  render(<ApiStatus />)

  expect(await screen.findByText('API unreachable (HTTP 502)')).toBeInTheDocument()
})
