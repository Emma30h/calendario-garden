function MonthHeaderSkeleton() {
  return (
    <header className="gc-panel relative z-30 !p-6 sm:!p-8">
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="auth-skeleton h-4 w-64 rounded" />
          <div className="auth-skeleton mt-2 h-4 w-80 rounded" />
        </div>

        <span className="auth-skeleton inline-flex h-11 w-11 rounded-full self-end sm:self-auto" />
      </div>
    </header>
  );
}

function MonthGridSkeleton() {
  return (
    <section className="gc-panel !p-5 sm:!p-8 lg:flex lg:min-h-0 lg:flex-col">
      <header className="mb-5 lg:mb-4">
        <div className="auth-skeleton h-10 w-64 rounded-lg" />
        <div className="auth-skeleton mt-2 h-4 w-80 rounded" />
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/75 bg-[#f8fbff] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] lg:flex-1 lg:min-h-0">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <span key={`weekday-${index}`} className="auth-skeleton h-6 rounded" />
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2 lg:min-h-0 lg:flex-1 lg:auto-rows-fr">
          {Array.from({ length: 42 }).map((_, index) => (
            <span
              key={`cell-${index}`}
              className="auth-skeleton h-[4.8rem] rounded-xl lg:h-[5.2rem]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function MonthStatsToggleSkeleton() {
  return (
    <section className="gc-panel !p-3 sm:!p-4 lg:!p-3">
      <div className="relative z-10 rounded-2xl border border-white/20 bg-white/10 px-4 py-3">
        <div className="auth-skeleton h-5 w-56 rounded" />
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6 lg:min-h-[100dvh] lg:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="space-y-4 lg:flex lg:h-[calc(100dvh-3rem)] lg:flex-col lg:gap-4 lg:space-y-0">
          <MonthHeaderSkeleton />
          <MonthGridSkeleton />
        </section>

        <MonthStatsToggleSkeleton />
      </div>
    </main>
  );
}
