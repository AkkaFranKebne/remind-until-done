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

  // Two links say it: the ‹ arrow at the top and the text link at the bottom. Both go home.
  const back = page.getByRole('link', { name: 'Back to rud.', exact: true })
  await expect(back).toHaveCount(2)
  for (const link of await back.all()) await expect(link).toHaveAttribute('href', '/')
  await page.getByText('Back to rud.', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your reminders' })).toBeVisible()
})

test('from the login page: the Privacy link opens the notice', async ({ page }) => {
  await signOut(page)

  await page.getByRole('link', { name: 'Privacy' }).click()
  await expectPrivacyPage(page)
})
