import { isWhichWindow, windowKind } from './messages'
import { isInstalledApp, pickWindow } from './windows'

type FakePort = { postMessage: (data: unknown) => void }

/** A MessageChannel stand-in: what goes into port2 comes out of port1. */
function fakeChannel() {
  const port1 = { onmessage: null as ((event: MessageEvent) => void) | null, close: jest.fn() }
  const port2: FakePort = {
    postMessage: (data) => port1.onmessage?.(new MessageEvent('message', { data })),
  }
  return { port1, port2 }
}

/** A page that answers the worker's question like answerWhichWindow does. */
function page(installed: boolean | 'silent') {
  return {
    postMessage: (message: unknown, [port]: FakePort[]) => {
      if (installed === 'silent' || !isWhichWindow(message)) return
      port?.postMessage(windowKind(installed))
    },
  }
}

const ask = (p: ReturnType<typeof page>, timeoutMs = 500) =>
  isInstalledApp(p, fakeChannel, timeoutMs)

test('the installed app says so', async () => {
  await expect(ask(page(true))).resolves.toBe(true)
})

test('a browser tab says so', async () => {
  await expect(ask(page(false))).resolves.toBe(false)
})

test('a page that never answers counts as a tab', async () => {
  await expect(ask(page('silent'), 20)).resolves.toBe(false)
})

test('a page that cannot be asked counts as a tab', async () => {
  const gone = {
    postMessage: () => {
      throw new Error('closed')
    },
  }
  await expect(isInstalledApp(gone, fakeChannel)).resolves.toBe(false)
})

const tab = { name: 'tab', installed: false }
const app = { name: 'app', installed: true }
const answer = (w: { installed: boolean }) => Promise.resolve(w.installed)

test('a tab used last and the app open: the app wins', async () => {
  await expect(pickWindow([tab, app], answer)).resolves.toBe(app)
})

test('only tabs: the one used last', async () => {
  const other = { name: 'other tab', installed: false }
  await expect(pickWindow([tab, other], answer)).resolves.toBe(tab)
})

test('a window whose answer fails counts as a tab', async () => {
  const broken = () => Promise.reject(new Error('no'))
  await expect(pickWindow([tab], broken)).resolves.toBe(tab)
})

test('no window: none, so the worker opens one', async () => {
  await expect(pickWindow([], answer)).resolves.toBeUndefined()
})
