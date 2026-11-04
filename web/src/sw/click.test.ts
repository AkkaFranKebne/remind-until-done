import { handleClick } from './click'

const TOKEN = 'a-done-token'
const data = { url: '/r/abc', doneToken: TOKEN }

function worker(answer: () => Promise<Response>) {
  return {
    open: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
    show: jest.fn(() => Promise.resolve()),
    closeAll: jest.fn(() => Promise.resolve()),
    tellPages: jest.fn(() => Promise.resolve()),
    post: jest.fn<Promise<Response>, [string, RequestInit]>(answer),
  }
}

const answers = (status: number) => () => Promise.resolve(new Response(null, { status }))

test('Done: sends the token in the body, not the address, and shows nothing more', async () => {
  const w = worker(answers(200))

  await handleClick({ action: 'done', data, tag: 'abc' }, w)

  expect(w.post).toHaveBeenCalledTimes(1)
  expect(w.post).toHaveBeenCalledWith(
    '/api/v1/actions',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: TOKEN }) }),
  )
  expect(w.show).not.toHaveBeenCalled()
  expect(w.open).not.toHaveBeenCalled()
  expect(w.tellPages).toHaveBeenCalledWith('abc') // open pages refresh
  expect(w.closeAll).toHaveBeenCalledWith('abc') // a nag that arrived meanwhile goes too
})

test('Done on a reminder deleted meanwhile: nothing left to do', async () => {
  const w = worker(answers(404))

  await handleClick({ action: 'done', data, tag: 'abc' }, w)

  expect(w.show).not.toHaveBeenCalled()
})

test.each([
  ['an edit or an old token', answers(401)],
  ['a server problem', answers(500)],
  ['no connection', () => Promise.reject(new TypeError('offline'))],
])('Done failed, %s: a new notification says so and opens the reminder', async (_name, answer) => {
  const w = worker(answer)

  await handleClick({ action: 'done', data, tag: 'abc' }, w)

  expect(w.show).toHaveBeenCalledTimes(1)
  expect(w.show).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Couldn't mark it done.",
      options: expect.objectContaining({
        body: 'Tap to open.',
        tag: 'abc',
        data: { url: '/r/abc' },
      }),
    }),
  )
  expect(w.tellPages).not.toHaveBeenCalled()
  expect(w.open).not.toHaveBeenCalled() // a phone may block opening it by itself
})

test('Done without a token: says it failed, without calling the API', async () => {
  const w = worker(answers(200))

  await handleClick({ action: 'done', data: { url: '/r/abc' }, tag: 'abc' }, w)

  expect(w.post).not.toHaveBeenCalled()
  expect(w.show).toHaveBeenCalledTimes(1)
})

test('Remind later: no API call and nothing opens', async () => {
  const w = worker(answers(200))

  await handleClick({ action: 'remind-later', data, tag: 'abc' }, w)

  expect(w.post).not.toHaveBeenCalled()
  expect(w.open).not.toHaveBeenCalled()
  expect(w.show).not.toHaveBeenCalled()
})

test('the body: opens the reminder, without marking it done', async () => {
  const w = worker(answers(200))

  await handleClick({ action: '', data, tag: 'abc' }, w)

  expect(w.open).toHaveBeenCalledWith('/r/abc')
  expect(w.post).not.toHaveBeenCalled()
})
