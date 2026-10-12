import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    // MCP server for coding agents, at http://localhost:6006/mcp while Storybook runs.
    // Only the read-only docs tools (which components exist, their props, their stories).
    {
      name: '@storybook/addon-mcp',
      options: { toolsets: { dev: false, docs: true, test: false } },
    },
  ],
  // The component list with props that the docs tools read.
  features: { componentsManifest: true },
  framework: '@storybook/react-vite',
}

export default config
