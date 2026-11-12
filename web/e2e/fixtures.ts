import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'

/**
 * Shared setup for the e2e tests. Every test runs as the installed app (display-mode standalone):
 * that's how people use rud., and a browser tab hides Enable notifications and shows install
 * hints instead (design doc §0). `test.use({ installed: false })` gives a browser tab.
 */
export const test = base.extend<{ installed: boolean }>({
  installed: [true, { option: true }],
  page: async ({ page, installed }, run) => {
    if (installed) {
      // Before the app's own code: answer "standalone" for the installed-app media query only.
      await page.addInitScript(() => {
        const real = window.matchMedia.bind(window)
        window.matchMedia = (query: string) => {
          const list = real(query)
          if (query === '(display-mode: standalone)') {
            Object.defineProperty(list, 'matches', { value: true })
          }
          return list
        }
      })
    }
    await run(page)
  },
})

export { expect }

declare global {
  interface Window {
    /** Set by pretendPermissionPromptAllows (page.exposeFunction). */
    e2eAllowNotifications: () => Promise<void>
  }
}

/**
 * A first-time notification prompt that the user answers with Allow. Headless Chromium has no
 * prompt and answers "denied" from the start, which the app shows as blocked. Here the
 * permission reads "default" (not asked yet) until the app asks; asking allows it for real
 * (`grantPermissions`) and answers "granted", like tapping Allow.
 */
export async function pretendPermissionPromptAllows(page: Page, context: BrowserContext) {
  await page.exposeFunction('e2eAllowNotifications', () =>
    context.grantPermissions(['notifications']),
  )
  await page.addInitScript(() => {
    const allow = window.e2eAllowNotifications
    let asked = false
    Object.defineProperty(Notification, 'permission', {
      get: () => (asked ? 'granted' : 'default'),
    })
    Notification.requestPermission = async () => {
      await allow()
      asked = true
      return 'granted'
    }
  })
}

/** The mock data's reminders (src/mocks/devApi.ts): fixed ids after every page load. */
export const SEED = {
  plumber: { id: '00000000-0000-4000-8000-000000000001', title: 'Book a plumber' },
  passport: { id: '00000000-0000-4000-8000-000000000004', title: 'Renew passport' },
} as const

/** The list, loaded: the heading is there and the skeleton is gone. */
export async function openList(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your reminders' })).toBeVisible()
  await expect(page.getByLabel('Loading reminders')).toHaveCount(0)
}

/** Add a reminder from the list with the + button: title only, the default time and interval. */
export async function addReminder(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add reminder' }).click()
  const sheet = page.getByRole('dialog', { name: 'Set the trap' })
  await sheet.getByLabel('What are you forgetting?').fill(title)
  await sheet.getByRole('radio', { name: 'In 1 h', exact: true }).check()
  await sheet.getByRole('button', { name: 'Start nagging me' }).click()
  await expect(sheet).toBeHidden()
}

/** Sign out from Settings, through the confirm sheet, and wait for the login page. */
export async function signOut(page: Page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page
    .getByRole('alertdialog', { name: 'Sign out?' })
    .getByRole('button', { name: 'Sign out' })
    .click()
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
}

/** A reminder row in the list (a link to its page). */
export const row = (page: Page, title: string) =>
  page.getByRole('link', { name: new RegExp(title) })
