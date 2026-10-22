import type { InstallState } from './useInstall'

/**
 * The states of a signed-in browser tab (Android or desktop: iPhone and iPad tabs can't sign
 * in, decision 42). The list's banner and Settings say what to do in each (decision 44).
 */
export type TabInstallState = 'installable' | 'just-installed' | 'app-found' | 'unavailable'

export const isTabInstallState = (state: InstallState): state is TabInstallState =>
  state === 'installable' ||
  state === 'just-installed' ||
  state === 'app-found' ||
  state === 'unavailable'

/** One line per state (Inventory → UX Copy; the last three are the login page's). */
export const tabInstallLine = {
  installable: 'Install rud. to get push notifications',
  'just-installed': 'Installed. Open rud. from your home screen.',
  'app-found': 'rud. is installed. Open it from your apps for notifications.',
  unavailable:
    'Push notifications need the installed app. Already installed? Open rud. from your apps.',
} satisfies Record<TabInstallState, string>
