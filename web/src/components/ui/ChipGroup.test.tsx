import { fireEvent, render, screen } from '@testing-library/react'
import { ChipGroup } from './ChipGroup'

const options = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 h' },
]

test('is a radio group named by its question, with the picked option checked', () => {
  render(<ChipGroup legend="Then nag me every" options={options} value="60" onChange={jest.fn()} />)

  expect(screen.getByRole('radiogroup', { name: 'Then nag me every' })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: '1 h' })).toBeChecked()
  expect(screen.getByRole('radio', { name: '30 min' })).not.toBeChecked()
})

test('tapping a chip picks it', () => {
  const onChange = jest.fn()
  render(
    <ChipGroup legend="Then nag me every" options={options} value={null} onChange={onChange} />,
  )

  fireEvent.click(screen.getByRole('radio', { name: '30 min' }))

  expect(onChange).toHaveBeenCalledWith('30')
})

test('onOptionClick hears every tap, even on the chip already picked', () => {
  const onOptionClick = jest.fn()
  render(
    <ChipGroup
      legend="Then nag me every"
      options={options}
      value="60"
      onChange={jest.fn()}
      onOptionClick={onOptionClick}
    />,
  )

  fireEvent.click(screen.getByRole('radio', { name: '1 h' }))

  expect(onOptionClick).toHaveBeenCalledWith('60')
})

test('an error shows right under the question, as an alert', () => {
  render(
    <ChipGroup
      legend="When should we start?"
      options={options}
      value={null}
      onChange={jest.fn()}
      error="Pick a time."
    />,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('Pick a time.')
})

test('an overlay sits in its chip’s box and adds no radio', () => {
  render(
    <ChipGroup
      legend="When should we start?"
      options={[
        { value: 'in1h', label: 'In 1 h' },
        { value: 'custom', label: 'Custom…', overlay: <span data-testid="overlay" /> },
      ]}
      value="in1h"
      onChange={jest.fn()}
    />,
  )

  // Same wrapper as the chip: the overlay can cover it (the iPhone date picker fix).
  expect(screen.getByTestId('overlay').parentElement).toBe(
    screen.getByRole('radio', { name: 'Custom…' }).parentElement,
  )
  expect(screen.getAllByRole('radio')).toHaveLength(2)
})

test('the legend is the bold question by default, or a quieter label', () => {
  const { rerender } = render(
    <ChipGroup legend="Then nag me every" options={options} value="60" onChange={jest.fn()} />,
  )
  expect(screen.getByText('Then nag me every')).toHaveClass('font-semibold', 'text-fg')

  rerender(
    <ChipGroup
      legend="Default nag interval"
      legendLook="label"
      options={options}
      value="60"
      onChange={jest.fn()}
    />,
  )
  expect(screen.getByText('Default nag interval')).toHaveClass('font-medium', 'text-fg2')
  expect(screen.getByRole('radiogroup', { name: 'Default nag interval' })).toBeInTheDocument()
})
