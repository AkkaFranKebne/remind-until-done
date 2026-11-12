import { SEED, expect, pretendPermissionPromptAllows, signOut, test } from './fixtures'

test('sign out asks first, then shows the login page', async ({ page }) => {
  await signOut(page)
  await expect(page).toHaveURL('/login')
})

test('a link opened while signed out goes to /login, then back to that page', async ({ page }) => {
  await signOut(page)

  await page.goto(`/r/${SEED.passport.id}`)
  await expect(page).toHaveURL(/\/login\?next=/)
  await page.getByRole('button', { name: 'Continue with Google' }).click()

  await expect(page).toHaveURL(`/r/${SEED.passport.id}`)
  await expect(page.getByRole('heading', { name: SEED.passport.title })).toBeVisible()
})

test('delete account: type DELETE, then the login page says so', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Delete account' }).click()

  const sheet = page.getByRole('alertdialog', { name: 'Delete your account?' })
  await sheet.getByLabel('Type DELETE').fill('DELETE')
  await sheet.getByRole('button', { name: 'Delete' }).click()

  await expect(
    page.getByText('Your account was deleted. All your reminders are gone.'),
  ).toBeVisible()
  await expect(page).toHaveURL('/login')
})

test.describe('notifications', () => {
  test('Enable notifications: the browser allows, Settings says it is on', async ({
    page,
    context,
  }) => {
    await pretendPermissionPromptAllows(page, context)
    await page.goto('/settings')
    await expect(page.getByText('Not on yet')).toBeVisible()

    await page.getByRole('button', { name: 'Enable notifications' }).click()

    await expect(page.getByText('This device is registered')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable notifications' })).toHaveCount(0)
  })

  test.describe('in a browser tab, not the installed app', () => {
    test.use({ installed: false })

    test('no Enable button: pushes need the installed app', async ({ page }) => {
      await page.goto('/settings')
      await expect(page.getByText('Needs the installed app')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Enable notifications' })).toHaveCount(0)
    })
  })
})
