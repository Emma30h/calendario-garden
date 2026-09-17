function AnnualMonthCardSkeleton({ index }: { index: number }) {
  return (
    <article className="gc-tile">
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
        <header className="gc-panel relative z-30 !p-6 sm:!p-8">
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

