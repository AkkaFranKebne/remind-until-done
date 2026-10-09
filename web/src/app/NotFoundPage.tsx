import { Link } from '@tanstack/react-router'
import { TopBar } from '../components/ui/TopBar'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar showSettings={false} />
      <main className="flex-1 px-4 pt-8 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-2 inline-block font-medium text-accent">
          Back to your reminders
        </Link>
      </main>
    </div>
  )
}
