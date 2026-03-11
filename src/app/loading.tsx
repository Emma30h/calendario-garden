function MonthGridSkeleton() {
  return (
    <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-xl shadow-black/5 sm:p-8 lg:flex lg:min-h-0 lg:flex-col">
      <header className="mb-5 lg:mb-4">
        <div className="skeleton-shimmer h-10 w-64 rounded-lg bg-[#e7ede2]" />
        <div className="skeleton-shimmer mt-2 h-4 w-80 rounded bg-[#eef3ea]" />
      </header>

      <div className="mb-2 grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }).map((_, index) => (
          <span
            key={`weekday-${index}`}
            className="skeleton-shimmer h-6 rounded bg-[#f0f4ec]"
          />
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2 lg:min-h-0 lg:flex-1 lg:auto-rows-fr">
        {Array.from({ length: 42 }).map((_, index) => (
          <span
            key={`cell-${index}`}
            className="skeleton-shimmer aspect-square rounded-xl bg-[#f3f7ef] lg:aspect-auto"
          />
        ))}
      </div>
    </section>
  );
}

function SideCardSkeleton() {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-lg shadow-black/5 lg:self-start">
      <div className="skeleton-shimmer mx-auto h-4 w-56 rounded bg-[#e7ede2]" />
      <div className="skeleton-shimmer mx-auto mt-3 h-10 w-44 rounded-full bg-[#d8e8cc]" />
    </section>
  );
}

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent px-4 py-10 sm:px-6 lg:h-screen lg:min-h-0 lg:py-4">
      <div className="w-full max-w-6xl space-y-6 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6 lg:space-y-0">
        <MonthGridSkeleton />
        <SideCardSkeleton />
      </div>
    </main>
  );
}

