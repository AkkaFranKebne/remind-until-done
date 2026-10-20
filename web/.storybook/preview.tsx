import type { Preview } from '@storybook/react-vite'
import '../src/index.css'
import { ToastProvider } from '../src/components/ui/Toast'
import { WithRouter } from '../src/test-utils/withRouter'

const preview: Preview = {
  // Toolbar switch: show every story in light or dark (sets data-theme like the app's tokens expect).
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  // Phone first: open stories in a phone-sized frame.
  initialGlobals: { theme: 'light', viewport: { value: 'mobile1', isRotated: false } },
  decorators: [
    (Story, context) => {
      document.documentElement.dataset.theme = context.globals.theme === 'dark' ? 'dark' : 'light'
      // Components with links (TopBar) need a router; pages that show toasts need the provider.
      return (
        <ToastProvider>
          <WithRouter>
            <Story />
          </WithRouter>
        </ToastProvider>
      )
    },
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
}

export default preview
