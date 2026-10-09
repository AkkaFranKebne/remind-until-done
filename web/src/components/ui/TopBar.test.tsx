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
