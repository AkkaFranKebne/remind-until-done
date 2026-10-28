import { render, screen } from '@testing-library/react'
import { WithRouter } from '../../test-utils/withRouter'
import { TopBar } from './TopBar'

function renderTopBar(props: Parameters<typeof TopBar>[0] = {}) {
  return render(
    <WithRouter>
      <TopBar {...props} />
    </WithRouter>,
  )
}

test('shows the logo and a Settings link by default', async () => {
  renderTopBar()

  expect(await screen.findByText('rud.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
})

test('hides the Settings link when nobody is signed in', async () => {
  renderTopBar({ showSettings: false })

  await screen.findByText('rud.')
  expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
})

test('shows the context line when given', async () => {
  renderTopBar({ contextLine: '3 things need your attention.' })

  expect(await screen.findByText('3 things need your attention.')).toBeInTheDocument()
})

test.each([
  ['plain', 'text-fg2'],
  ['brand', 'text-on-grad'],
  ['waiting', 'text-on-grad'],
  ['nag-low', 'text-nag-low-fg'],
  ['nag-mid', 'text-nag-mid-fg'],
  ['nag-high', 'text-nag-high-fg'],
  ['overdue', 'text-tile-overdue-fg'],
  ['done', 'text-tag-done-fg'],
] as const)('tone %s colours the Settings icon with %s', async (tone, colourClass) => {
  renderTopBar({ tone })

  expect(await screen.findByRole('link', { name: 'Settings' })).toHaveClass(colourClass)
})

test.each([
  ['plain', 'text-accent'],
  ['brand', 'text-on-grad'],
  ['nag-mid', 'text-on-grad'],
  ['done', 'text-on-grad'],
] as const)('tone %s colours the logo with %s', async (tone, colourClass) => {
  renderTopBar({ tone })

  expect(await screen.findByRole('link', { name: /rud\./ })).toHaveClass(colourClass)
})

test('the logo links to the reminders list', async () => {
  renderTopBar()

  expect(await screen.findByRole('link', { name: /rud\./ })).toHaveAttribute('href', '/')
})
