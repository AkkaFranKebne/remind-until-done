import { AxeBuilder } from '@axe-core/playwright'
import { SEED, expect, openList, signOut, test } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * axe checks each screen for the problems a machine can find: missing names and labels, contrast,
 * wrong ARIA, headings. WCAG 2.1 A and AA, like Inventory → Accessibility. It can't judge
 * everything (focus order, wording), so the ui-reviewer and real use still matter.
 */
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  // Rule id, how bad, and where: enough to find it without opening the report.
  const found = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    where: v.nodes.map((n) => n.target.join(' ')),
  }))
  expect(found).toEqual([])
}

test('the list', async ({ page }) => {
  await openList(page)
  await expectNoViolations(page)
})

test('the add sheet', async ({ page }) => {
  await openList(page)
  await page.getByRole('button', { name: 'Add reminder' }).click()
  await expect(page.getByRole('dialog', { name: 'Set the trap' })).toBeVisible()
  await expectNoViolations(page)
})

test('a reminder page: waiting and overdue', async ({ page }) => {
  await page.goto(`/r/${SEED.plumber.id}`)
  await expect(page.getByRole('heading', { name: SEED.plumber.title })).toBeVisible()
  await expectNoViolations(page)

  await page.goto(`/r/${SEED.passport.id}`)
  await expect(page.getByRole('heading', { name: SEED.passport.title })).toBeVisible()
  await expectNoViolations(page)
})

test('Settings', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expectNoViolations(page)
})

test('the login page', async ({ page }) => {
  await signOut(page)
  await expectNoViolations(page)
})

test('the privacy page', async ({ page }) => {
  await page.goto('/privacy.html')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expectNoViolations(page)
})
