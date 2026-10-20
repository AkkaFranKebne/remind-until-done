import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef } from 'react'
import { Button } from './Button'
import { useToast } from './useToast'

/** Shows one toast when the story opens (it goes away after 4 s: "Show again"). */
function Show({ tone, text }: { tone: 'success' | 'error'; text: string }) {
  const toast = useToast()
  const shown = useRef(false)
  useEffect(() => {
    // Base UI's toast manager lives outside React; show it once, not on every render.
    if (shown.current) return
    shown.current = true
    toast[tone](text)
  }, [toast, tone, text])
  return (
    <div className="p-4">
      <Button variant="ghost" onClick={() => toast[tone](text)}>
        Show again
      </Button>
    </div>
  )
}

// Storybook's global wrapper (.storybook/preview.tsx) provides the ToastProvider.
const meta = {
  title: 'UI/Toast',
  component: Show,
} satisfies Meta<typeof Show>

export default meta
type Story = StoryObj<typeof meta>

/** After swiping a row to Done. */
export const Success: Story = { args: { tone: 'success', text: 'Finally. Done.' } }

/** A swipe the API refused: the row comes back. */
export const Error: Story = {
  args: { tone: 'error', text: 'Something went wrong. Try again in a moment.' },
}
