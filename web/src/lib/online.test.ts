import { onlineManager } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { apiFetch, setTokenSource } from './api/mutator'
import { requestFailed } from './online'

function firebaseError(code: string) {
  return Object.assign(new Error(code), { name: 'FirebaseError', code })
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 50))

afterEach(() => {
  setTokenSource(() => Promise.resolve(null))
})

test('a failed request with the server still answering is not offline', async () => {
  server.use(http.get('*/api/v1/healthz', () => HttpResponse.json({})))
  requestFailed()
  await flush()
  expect(onlineManager.isOnline()).toBe(true)
})

test('a failed request with no server is offline', async () => {
  server.use(http.get('*/api/v1/healthz', () => HttpResponse.error()))
  requestFailed()
  await waitFor(() => expect(onlineManager.isOnline()).toBe(false))
})

test('an API answer that is an error is not offline', async () => {
  server.use(http.get('*/api/v1/x', () => HttpResponse.json({}, { status: 500 })))
  await expect(apiFetch('http://localhost/api/v1/x', {})).rejects.toMatchObject({ status: 500 })
  await flush()
  expect(onlineManager.isOnline()).toBe(true)
})

test('a request with no connection is ApiError 0, and leads to offline', async () => {
  server.use(
    http.get('*/api/v1/x', () => HttpResponse.error()),
    http.get('*/api/v1/healthz', () => HttpResponse.error()),
  )
  await expect(apiFetch('http://localhost/api/v1/x', {})).rejects.toMatchObject({ status: 0 })
  await waitFor(() => expect(onlineManager.isOnline()).toBe(false))
})

test('a cancelled request says nothing about the connection', async () => {
  server.use(http.get('*/api/v1/healthz', () => HttpResponse.error()))
  const stop = new AbortController()
  stop.abort()
  await expect(
    apiFetch('http://localhost/api/v1/x', { signal: stop.signal }),
  ).rejects.toMatchObject({
    status: 0,
  })
  await flush()
  expect(onlineManager.isOnline()).toBe(true)
})

test('a token that needs the network to refresh counts as a network failure too', async () => {
  server.use(http.get('*/api/v1/healthz', () => HttpResponse.error()))
  setTokenSource(() => Promise.reject(firebaseError('auth/network-request-failed')))
  await expect(apiFetch('http://localhost/api/v1/x', {})).rejects.toMatchObject({ status: 0 })
  await waitFor(() => expect(onlineManager.isOnline()).toBe(false))
})

test('any other sign-in failure is not about the connection', async () => {
  server.use(http.get('*/api/v1/healthz', () => HttpResponse.error()))
  const failure = firebaseError('auth/user-token-expired')
  setTokenSource(() => Promise.reject(failure))
  await expect(apiFetch('http://localhost/api/v1/x', {})).rejects.toBe(failure)
  await flush()
  expect(onlineManager.isOnline()).toBe(true)
})
