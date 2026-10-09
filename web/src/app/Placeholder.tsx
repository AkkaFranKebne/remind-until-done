/** Temporary page body until the real page is built. */
export function Placeholder({ title, milestone }: { title: string; milestone: string }) {
  return (
    <section className="pt-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-fg3">Coming in {milestone}.</p>
    </section>
  )
}
