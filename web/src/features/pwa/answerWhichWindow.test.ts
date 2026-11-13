import { pushArrived, readWindowKind, whichWindow } from '../../sw/messages'
import { pretendServiceWorker, resetDevice } from '../../test-utils/device'
import { answerWhichWindow } from './answerWhichWindow'

afterEach(resetDevice)

/** The worker sends one message with a reply port; returns what the page posted back. */
function ask(installed: () => boolean, data: unknown) {
  pretendServiceWorker()
  answerWhichWindow(installed)
  const port = { postMessage: jest.fn() }
  navigator.serviceWorker.dispatchEvent(
    Object.assign(new Event('message'), { data, ports: [port] }),
  )
  return port.postMessage
}

test.each([
  [true, 'the installed app'],
  [false, 'a browser tab'],
])('answers %s for %s', (installed) => {
  const reply = ask(() => installed, whichWindow())

  expect(reply).toHaveBeenCalledTimes(1)
  expect(readWindowKind(reply.mock.calls[0]?.[0])).toBe(installed)
})

test('ignores other messages from the worker', () => {
  const installed = jest.fn(() => true)

  const reply = ask(installed, pushArrived('abc'))

  expect(reply).not.toHaveBeenCalled()
  expect(installed).not.toHaveBeenCalled()
})

test('no service worker: nothing to answer', () => {
  expect(() => answerWhichWindow()).not.toThrow()
})
