import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { TextField } from './TextField'

function Controlled(props: ComponentProps<typeof TextField>) {
  const [value, setValue] = useState(props.value)
  return <TextField {...props} value={value} onChange={setValue} />
}

const meta = {
  title: 'UI/TextField',
  component: TextField,
  render: (args) => <Controlled {...args} />,
  args: { name: 'title', label: 'What are you forgetting?', value: '', onChange: () => {} },
} satisfies Meta<typeof TextField>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = { args: { placeholder: 'File tax return' } }

export const Filled: Story = { args: { value: 'File tax return' } }

/** Inline error, accent border. Never a toast for form validation. */
export const WithError: Story = { args: { error: 'Give it a name first.' } }

/** Optional textarea with the counter (accent from 90%). */
export const NoteWithCounter: Story = {
  args: {
    name: 'note',
    label: 'Note',
    optional: true,
    multiline: true,
    maxLength: 200,
    value: 'Need the docs from the green folder on my desk',
  },
}

export const NoteNearTheLimit: Story = {
  args: { ...NoteWithCounter.args, value: 'x'.repeat(186) },
}
