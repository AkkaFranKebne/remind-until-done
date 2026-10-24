import { pushArrived, readPushArrived } from './messages'

test('what the worker sends, the page reads back', () => {
  expect(readPushArrived(pushArrived('abc'))).toEqual(pushArrived('abc'))
  expect(readPushArrived(pushArrived(undefined))?.reminderId).toBeNull()
})

test('anything else is not a push (MSW talks to the page in mock mode too)', () => {
  for (const other of [undefined, null, 'rud:push-arrived', 42, {}, { type: 'MOCKING_ENABLED' }]) {
    expect(readPushArrived(other)).toBeUndefined()
  }
  expect(readPushArrived({ type: 'rud:push-arrived', reminderId: 7 })?.reminderId).toBeNull()
})
