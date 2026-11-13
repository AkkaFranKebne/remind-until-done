import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests (design doc 5.9, M7): the whole app in a real browser, against the mock mode
 * (`npm run dev:mock`: MSW's fake API and a fake sign-in, no Go API, database or Firebase).
 * One phone-sized Chromium (owner's choice, 2026-11-12). Tests: e2e/*.spec.ts.
 * Run: `npm run test:e2e` (starts the mock server itself).
 */
const PORT = 5174 // not 5173, so a running `npm run dev` doesn't get in the way

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A test.only left in by mistake fails CI instead of quietly skipping the rest.
  forbidOnly: Boolean(process.env.CI),
  // No retries: a flaky test should be fixed, not hidden.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The same zone and language on every machine, like Jest's TZ.
    timezoneId: 'Europe/Stockholm',
    locale: 'en-GB',
    // On a failure: a step-by-step recording to open with `npx playwright show-trace`.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run dev:mock -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
