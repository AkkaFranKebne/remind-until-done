import { toNotification } from './notification'
import { showOnlyNewest } from './show'

/** A notification tray like the browser's: shown notifications by tag, and what happened. */
function fakeTray({ listing = true } = {}) {
  const log: string[] = []
  const shown: { tag: string; title: string }[] = []
  const tray = {
    getNotifications: () => {
      if (!listing) return Promise.reject(new Error('not supported'))
      return Promise.resolve(
        shown.map((n) => ({
          tag: n.tag,
          close: () => {
            shown.splice(shown.indexOf(n), 1)
            log.push(`close ${n.title}`)
          },
        })),
      )
    },
    showNotification: (title: string, options?: NotificationOptions) => {
      // Like iPhone Safari: a new one with the same tag doesn't replace the old one.
      shown.push({ tag: options?.tag ?? '', title })
      log.push(`show ${title}`)
      return Promise.resolve()
    },
  }
  return { tray, shown, log }
}

const nag = (reminderId: string, title: string) =>
  toNotification({ data: { reminderId, title, body: 'Still waiting for you.' } })

test('a new nag closes the reminder’s older ones first, so the tray keeps only the newest', async () => {
  const { tray, shown, log } = fakeTray()
  await showOnlyNewest(tray, nag('a', 'Pay rent 1'))
  await showOnlyNewest(tray, nag('b', 'Call mum'))
  await showOnlyNewest(tray, nag('a', 'Pay rent 2'))
  await showOnlyNewest(tray, nag('a', 'Pay rent 3'))

  expect(shown.map((n) => n.title)).toEqual(['Call mum', 'Pay rent 3'])
  // Closed before showing, or the new one would close itself.
  expect(log.slice(-2)).toEqual(['close Pay rent 2', 'show Pay rent 3'])
})

test('still shows the nag where notifications can’t be listed', async () => {
  const { tray, shown } = fakeTray({ listing: false })
  await showOnlyNewest(tray, nag('a', 'Pay rent'))
  expect(shown.map((n) => n.title)).toEqual(['Pay rent'])
})

test('a push that isn’t a reminder’s closes nothing', async () => {
  const { tray, shown } = fakeTray()
  const consolePush = toNotification({ notification: { title: 'Test', body: 'Hi' } })
  await showOnlyNewest(tray, consolePush)
  await showOnlyNewest(tray, consolePush)
  expect(shown).toHaveLength(2)
})
