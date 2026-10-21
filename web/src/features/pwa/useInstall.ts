import { useMutation } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { getState, promptInstall, subscribe, type InstallPromptState } from './installPrompt'
import { isStandalone, isTooOld, readIos, subscribeStandalone, type Ios } from './platform'

/**
 * Where this device stands with installing rud. (design doc §0 "Detection logic", 5.1
 * "Install card placement"; owner decisions 2026-10-20, decision 42):
 * - `ios-too-old`: iOS before 16.4, no web push at all: a hard stop, wherever it's opened.
 * - `installed`: opened from the home screen icon.
 * - `ios-browser`: an iPhone or iPad in a browser tab: the Share → Add to Home Screen steps.
 * - `installable`: Chrome offered to install: our Install button.
 * - `just-installed`: installed from this tab just now; the app opens from the home screen.
 * - `app-found`: a tab, and the browser says rud. is already installed: open the app.
 * - `unavailable`: a tab with no install offer and no answer (Firefox, desktop Safari, a dismissed
 *   offer, or installed but the browser can't tell): install it, or open it if it's there.
 */
export type InstallState =
  | 'ios-too-old'
  | 'installed'
  | 'ios-browser'
  | 'installable'
  | 'just-installed'
  | 'app-found'
  | 'unavailable'

/** The state, plus the iPhone or iPad it's on (always there for the two iOS states). */
export type InstallInfo =
  | { state: 'ios-too-old' | 'ios-browser'; ios: Ios }
  | { state: Exclude<InstallState, 'ios-too-old' | 'ios-browser'>; ios: Ios | null }

export function useInstall(): InstallInfo & {
  /** Shows Chrome's install dialog (state `installable`); `isPending` while it's open. */
  install: ReturnType<typeof useInstallMutation>
} {
  const prompt = useSyncExternalStore(subscribe, getState)
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone)
  const install = useInstallMutation()
  const ios = readIos(navigator.userAgent, navigator.maxTouchPoints)

  return { ...installStateOf({ ios, standalone, prompt }), install }
}

// networkMode 'always': the dialog is the browser's, not the network's (offline it still works).
const useInstallMutation = () => useMutation({ mutationFn: promptInstall, networkMode: 'always' })

/** The state from what the browser told us (pure, for tests). */
export function installStateOf({
  ios,
  standalone,
  prompt,
}: {
  ios: Ios | null
  standalone: boolean
  prompt: InstallPromptState
}): InstallInfo {
  if (ios && isTooOld(ios)) return { state: 'ios-too-old', ios }
  if (standalone) return { state: 'installed', ios }
  if (ios) return { state: 'ios-browser', ios }
  if (prompt.prompt) return { state: 'installable', ios }
  if (prompt.installed) return { state: 'just-installed', ios }
  if (prompt.appFound) return { state: 'app-found', ios }
  return { state: 'unavailable', ios }
}
