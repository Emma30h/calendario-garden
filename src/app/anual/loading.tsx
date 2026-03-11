function AnnualMonthCardSkeleton({ index }: { index: number }) {
  return (
    <article className="rounded-2xl border border-white/20 bg-black/20 p-4 shadow-xl shadow-black/30 backdrop-blur-sm">
      <div className="auth-skeleton h-5 w-28 rounded" />

      <div className="mt-3 grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, dayIndex) => (
          <span
            key={`week-${index}-${dayIndex}`}
            className="auth-skeleton h-4 rounded"
          />
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, cellIndex) => (
          <span
            key={`cell-${index}-${cellIndex}`}
            className="auth-skeleton h-7 rounded-md"
          />
        ))}
      </div>
    </article>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="relative z-30 rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -bottom-28 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl"
          />
          <div className="relative">
            <div className="auth-skeleton h-11 w-64 rounded-lg" />
            <div className="auth-skeleton mt-2 h-4 w-80 rounded" />
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }).map((_, index) => (
            <AnnualMonthCardSkeleton key={index} index={index} />
          ))}
        </section>
      </div>
    </main>
  );
}

