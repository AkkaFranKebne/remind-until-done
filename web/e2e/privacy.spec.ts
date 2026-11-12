import type { Page } from '@playwright/test'
import { expect, signOut, test } from './fixtures'

async function expectPrivacyPage(page: Page) {
  await expect(page).toHaveURL('/privacy.html')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What rud. keeps' })).toBeVisible()
}

test('from Settings: the Privacy row opens the notice, Back to rud. goes home', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Privacy' }).click()
  await expectPrivacyPage(page)

  await page.getByRole('link', { name: 'Back to rud.', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Your reminders' })).toBeVisible()
})

test('from the login page: the Privacy link opens the notice', async ({ page }) => {
  await signOut(page)

  await page.getByRole('link', { name: 'Privacy' }).click()
  await expectPrivacyPage(page)
})
