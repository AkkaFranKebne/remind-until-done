import { Outlet } from '@tanstack/react-router'
import { TopBar } from '../components/ui/TopBar'

/** Shell for signed-in pages: the header stays, the page content changes. */
export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="flex-1 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  )
}
