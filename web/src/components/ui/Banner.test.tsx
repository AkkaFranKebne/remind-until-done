import { fireEvent, render, screen } from '@testing-library/react'
import { Bell } from 'lucide-react'
import { WithRouter } from '../../test-utils/withRouter'
import { Banner, BannerButton, BannerLink } from './Banner'

test('a named region with its line and actions; the icon is hidden from screen readers', () => {
  let tapped = 0
  const { container } = render(
    <Banner
      label="Turn on notifications"
      icon={Bell}
      actions={<BannerButton onClick={() => (tapped += 1)}>Enable</BannerButton>}
    >
      Enable notifications so we can nag you.
    </Banner>,
  )

  const banner = screen.getByRole('region', { name: 'Turn on notifications' })
  expect(banner).toHaveTextContent('Enable notifications so we can nag you.')
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
  expect(tapped).toBe(1)
})

test('a busy button keeps its name and focus, says so, and ignores taps', () => {
  let tapped = 0
  render(
    <BannerButton busy onClick={() => (tapped += 1)}>
      Enable
    </BannerButton>,
  )
  const button = screen.getByRole('button', { name: 'Enable' })
  button.focus()

  fireEvent.click(button)

  expect(button).toHaveAttribute('aria-busy', 'true')
  expect(button).toHaveFocus()
  expect(tapped).toBe(0)
})

test('BannerLink is a real link', async () => {
  render(
    <WithRouter>
      <BannerLink to="/settings">Show me</BannerLink>
    </WithRouter>,
  )

  expect(await screen.findByRole('link', { name: 'Show me' })).toHaveAttribute('href', '/settings')
})

test('live: the line is a status, so a change is announced', () => {
  render(
    <Banner label="Install the app" icon={Bell} live>
      Installed. Open rud. from your home screen.
    </Banner>,
  )

  expect(screen.getByRole('status')).toHaveTextContent(
    'Installed. Open rud. from your home screen.',
  )
})
