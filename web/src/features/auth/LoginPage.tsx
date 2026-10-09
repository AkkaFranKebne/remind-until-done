import { Placeholder } from '../../app/Placeholder'
import { TopBar } from '../../components/ui/TopBar'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nobody is signed in yet, so no Settings icon. */}
      <TopBar showSettings={false} />
      <main className="flex-1 px-4">
        <Placeholder title="Sign in" milestone="M1" />
      </main>
    </div>
  )
}
