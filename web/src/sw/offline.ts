/**
 * Which cached page answers a page load while offline: the privacy notice for its own address
 * (web/privacy.html, design doc 7.3), the app for everything else. The app then shows its own
 * "no connection" state.
 */
export function offlinePage(pathname: string): 'privacy.html' | 'index.html' {
  return pathname === '/privacy.html' ? 'privacy.html' : 'index.html'
}
