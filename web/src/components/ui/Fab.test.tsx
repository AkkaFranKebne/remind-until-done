import { fireEvent, render, screen } from '@testing-library/react'
import { Plus } from 'lucide-react'
import { Fab } from './Fab'

test('an icon button with a spoken name', () => {
  const onClick = jest.fn()
  render(<Fab icon={Plus} label="Add reminder" onClick={onClick} />)

  fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }))

  expect(onClick).toHaveBeenCalledTimes(1)
})
