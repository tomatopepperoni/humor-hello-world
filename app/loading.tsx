/** Skeleton while a page's data loads (feed, post, leaderboard, profile). */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6" aria-busy="true" aria-label="Loading">
      <div className="h-40 animate-pulse rounded-xl bg-ink/10 motion-reduce:animate-none" />
      {[0, 1].map((i) => (
        <div key={i} className="mt-6 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-full bg-ink/10" />
            <div className="h-3 w-32 rounded bg-ink/10" />
          </div>
          <div className="mt-4 h-48 rounded-lg bg-ink/5" />
          <div className="mt-4 space-y-3">
            <div className="h-3 w-5/6 rounded bg-ink/10" />
            <div className="h-3 w-2/3 rounded bg-ink/10" />
          </div>
        </div>
      ))}
    </main>
  );
}
