import { fireEvent, render, screen } from '@testing-library/react'
import { TextField } from './TextField'

test('the label names the input, and typing reports the new value', () => {
  const onChange = jest.fn()
  render(<TextField name="title" label="What are you forgetting?" value="" onChange={onChange} />)

  fireEvent.change(screen.getByRole('textbox', { name: 'What are you forgetting?' }), {
    target: { value: 'File tax return' },
  })

  expect(onChange).toHaveBeenCalledWith('File tax return')
})

test('an error marks the field invalid and is read with it', () => {
  render(
    <TextField
      name="title"
      label="Title"
      value=""
      onChange={jest.fn()}
      error="Give it a name first."
    />,
  )

  const input = screen.getByRole('textbox', { name: 'Title' })
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription(expect.stringContaining('Give it a name first.'))
})

test('the counter counts characters like the API (ä and emoji are 1 each)', () => {
  render(
    <TextField
      name="note"
      label="Note"
      optional
      multiline
      maxLength={200}
      value="ä😀b"
      onChange={jest.fn()}
    />,
  )

  expect(screen.getByRole('textbox', { name: 'Note · optional' })).toHaveAccessibleDescription(
    '3 / 200',
  )
})

test('the counter turns accent near the limit', () => {
  render(
    <TextField
      name="note"
      label="Note"
      multiline
      maxLength={200}
      value={'x'.repeat(180)}
      onChange={jest.fn()}
    />,
  )

  expect(screen.getByText('180 / 200')).toHaveClass('text-accent')
})

test('the counter is grey below 90% and red over the limit', () => {
  const { rerender } = render(
    <TextField name="note" label="Note" maxLength={200} value="hi" onChange={jest.fn()} />,
  )
  expect(screen.getByText('2 / 200')).toHaveClass('text-fg2')

  rerender(
    <TextField
      name="note"
      label="Note"
      maxLength={200}
      value={'x'.repeat(201)}
      onChange={jest.fn()}
    />,
  )
  expect(screen.getByText('201 / 200')).toHaveClass('text-error-text')
})

test('errors are red: the message and the border', () => {
  render(
    <TextField
      name="title"
      label="Title"
      value=""
      onChange={jest.fn()}
      error="Title is required"
    />,
  )

  expect(screen.getByText('Title is required')).toHaveClass('text-error-text')
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveClass(
    'data-invalid:border-error-text',
  )
})
