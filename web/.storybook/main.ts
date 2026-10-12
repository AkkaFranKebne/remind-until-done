import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  // Storybook stays on plain http: the https certificate is only for the app's sign-in.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: (viteConfig.plugins ?? []).filter(
      (p) => !(p && typeof p === 'object' && 'name' in p && p.name.includes('basic-ssl')),
    ),
  }),
}

export default config
