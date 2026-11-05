import { CenteredScreen } from '../../components/ui/CenteredScreen'
import { OfflineContent } from '../../components/ui/OfflineContent'
import { TopBar } from '../../components/ui/TopBar'
import { useAuth } from './useAuth'

/**
 * The app opened with no connection, so we don't know yet who this is: the session is kept, the
 * message shows, and when the connection is back sign-in goes on from where it stopped.
 */
export function OfflineScreen() {
  const { retrySignIn } = useAuth()
  return (
    <CenteredScreen header={<TopBar showSettings={false} />}>
      <OfflineContent onBack={retrySignIn} />
    </CenteredScreen>
  )
}
