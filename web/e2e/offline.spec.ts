import { expect, openList, test } from './fixtures'

test('no connection: the offline message; back online: the list again', async ({
  page,
  context,
}) => {
  await openList(page)

  await context.setOffline(true)
  await expect(page.getByRole('heading', { name: "You're completely offline." })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your reminders' })).toBeHidden()

  // Try again while still offline: the message stays.
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: "You're completely offline." })).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: 'Your reminders' })).toBeVisible()
  await expect(page.getByRole('heading', { name: "You're completely offline." })).toHaveCount(0)
})
