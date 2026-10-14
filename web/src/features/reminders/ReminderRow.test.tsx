import { render, screen } from '@testing-library/react'
import type { Reminder } from '../../lib/api/generated/model'
import { WithRouter } from '../../test-utils/withRouter'
import { ReminderRow } from './ReminderRow'

const now = new Date('2026-10-14T10:00:00Z')

function renderRow(over: Partial<Reminder>) {
  const reminder: Reminder = {
    id: 'abc',
    title: 'Call dentist',
    dueAt: '2026-10-15T09:00:00Z',
    status: 'pending',
    createdAt: '2026-10-14T08:00:00Z',
    updatedAt: '2026-10-14T08:00:00Z',
    nagIntervalMin: 60,
    nagCount: 0,
    nagsExhausted: false,
    ...over,
  }
  return render(
    <WithRouter>
      <ReminderRow reminder={reminder} now={now} />
    </WithRouter>,
  )
}

test('the whole row is a link to the reminder page; a waiting row counts down, with a Waiting chip', async () => {
  renderRow({})

  const link = await screen.findByRole('link', { name: /Call dentist/ })
  expect(link).toHaveAttribute('href', '/r/abc')
  expect(link).toHaveTextContent('Starts in 23:00')
  expect(screen.getByText('Waiting')).toHaveClass('bg-chip-on-waiting-row')
})

test('a nagging row shows the push count and a chip; the dot pulses from push 4', async () => {
  const { container } = renderRow({ status: 'sent', nagCount: 5 })

  expect(await screen.findByText('Still here (5/12)')).toBeInTheDocument()
  expect(screen.getByText('Nagging')).toBeInTheDocument()
  expect(container.querySelector('.animate-nag-pulse')).toHaveClass('motion-reduce:animate-none')
})

test('an overdue row says so, with the overdue chip', async () => {
  renderRow({ status: 'sent', nagCount: 12, nagsExhausted: true })

  expect(await screen.findByText("We gave up. You didn't.")).toBeInTheDocument()
  expect(screen.getByText('Overdue')).toBeInTheDocument()
})

test('a done row is crossed out and says when', async () => {
  renderRow({ status: 'done', doneAt: '2026-10-14T07:00:00Z' })

  expect(await screen.findByText('Call dentist')).toHaveClass('line-through')
  expect(screen.getByText('Done 3h ago')).toBeInTheDocument()
})
