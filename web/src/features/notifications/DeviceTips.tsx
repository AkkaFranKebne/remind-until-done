import { StepsCard } from '../../components/ui/StepsCard'
import { macBrowser, readIos, type Ios } from '../pwa/platform'

/** iOS 18 put every app under Settings → Apps; before that, apps were further down the list. */
export function FindRud({ ios }: { ios: Ios }) {
  const major = ios.version?.[0]
  return major === undefined || major >= 18 ? (
    <>
      Tap <strong>Apps → rud.</strong>
    </>
  ) : (
    <>
      Scroll to <strong>rud.</strong>
    </>
  )
}

/**
 * iPhone and iPad hide what a notification says on a locked phone by default (Show Previews:
 * When Unlocked): only "rud." shows. A grey card with the way to "Always" (decision 43). In
 * Settings, and on the login page (decision 74).
 */
export function PreviewsTip({ heading }: { heading?: 'h2' | 'h3' }) {
  const ios = readIos(navigator.userAgent, navigator.maxTouchPoints)
  if (!ios) return null
  return (
    <StepsCard
      tone="quiet"
      title="Nags say just “rud.” when locked?"
      heading={heading}
      steps={[
        <>
          Open {ios.device} <strong>Settings</strong>
        </>,
        <FindRud key="find" ios={ios} />,
        <>
          Tap <strong>Notifications → Show Previews</strong>
        </>,
        <>
          Pick <strong>Always</strong>
        </>,
      ]}
      footer="Your nags will be readable on the lock screen, and maybe you'll become more productive."
    />
  )
}

/**
 * macOS can mute the browser while the browser still says "allowed", so rud. can't see it and
 * looks On. A grey card with the way to unmute it, on a Mac only (decision 50).
 */
export function MacMutedTip() {
  const browser = macBrowser(navigator.userAgent, navigator.maxTouchPoints)
  if (!browser) return null
  return (
    <StepsCard
      tone="quiet"
      title="No nagging showing up on your Mac?"
      steps={[
        <>
          Open <strong>System Settings → Notifications</strong>
        </>,
        <>
          Open <strong>{browser}</strong>, and <strong>rud.</strong> if it&apos;s there. {browser}{' '}
          may show up twice: do each one.
        </>,
        <>
          Turn on <strong>Allow notifications</strong>
        </>,
        <>
          Pick <strong>Banners</strong> or <strong>Alerts</strong>
        </>,
      ]}
      footer={`macOS can mute ${browser} even when rud. says On.`}
    />
  )
}
