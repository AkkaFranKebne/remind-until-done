import { render, screen } from '@testing-library/react'
import { WithRouter } from '../../test-utils/withRouter'
import { PageHeader } from './PageHeader'

test('shows the title as the page heading, with a Back link', async () => {
  render(
    <WithRouter>
      <PageHeader title="Settings" backTo="/" />
    </WithRouter>,
  )

  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
})
