import { SEED, addReminder, expect, openList, row, test } from './fixtures'

test('create a reminder, then mark it done', async ({ page }) => {
  await openList(page)
  await addReminder(page, 'Pay the electricity bill')

  await row(page, 'Pay the electricity bill').click()
  await expect(page.getByRole('heading', { name: 'Pay the electricity bill' })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByText('Completed')).toBeVisible()

  await page.getByRole('link', { name: 'Back' }).click()
  await page
    .getByRole('group', { name: 'Filter reminders' })
    .getByRole('button', { name: /^Done/ })
    .click()
  await expect(row(page, 'Pay the electricity bill')).toBeVisible()
})

test('at 5 active reminders the + button gives way to a note', async ({ page }) => {
  await openList(page) // the mock starts with 4 active
  await addReminder(page, 'Return the library books')

  await expect(page.getByRole('button', { name: 'Add reminder' })).toHaveCount(0)
  await expect(
    page.getByText(
      "You've hit 5 active reminders. Finish one before adding another. We believe in you.",
    ),
  ).toBeVisible()
})

test('edit the interval, then delete the reminder', async ({ page }) => {
  await openList(page)
  await row(page, SEED.plumber.title).click()

  await page.getByRole('button', { name: 'Edit' }).click()
  const sheet = page.getByRole('dialog', { name: 'Adjust the trap' })
  await sheet.getByRole('radio', { name: '2 h', exact: true }).check()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('2 h', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Delete this reminder?' })
  await confirm.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText("Gone. We'll pretend it never happened.")).toBeVisible()
  await expect(row(page, SEED.plumber.title)).toHaveCount(0)
})
