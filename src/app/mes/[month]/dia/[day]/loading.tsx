function DayHeaderSkeleton() {
  return (
    <header className="relative mx-auto w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] px-4 py-3 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:w-full sm:px-6 sm:py-4 lg:col-span-2 lg:mx-0 lg:w-auto lg:max-w-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-sky-300/18 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl"
      />

      <div className="relative flex items-center gap-2">
        <span className="auth-skeleton h-4 w-40 rounded" />
        <span className="auth-skeleton h-4 w-2 rounded" />
        <span className="auth-skeleton h-4 w-20 rounded" />
        <span className="auth-skeleton h-4 w-2 rounded" />
        <span className="auth-skeleton h-4 w-16 rounded" />
      </div>
    </header>
  );
}

function DayNotebookSkeleton() {
  return (
    <section className="relative mx-auto w-[calc(100%-1rem)] max-w-3xl rounded-[2rem] border border-black/10 bg-[#fffdf6] pb-7 pt-14 shadow-2xl shadow-black/10 sm:w-full sm:pb-8 sm:pt-[3.75rem] lg:mx-auto lg:flex lg:flex-col lg:pb-6 lg:pt-16">
      <div className="absolute inset-x-0 top-0 h-12 rounded-t-[2rem] bg-[#dbe6ce]" />
      <div className="absolute inset-x-0 top-3 z-30 flex justify-center gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            key={index}
            className="h-6 w-4 rounded-b-full border-2 border-black/20 bg-white"
          />
        ))}
      </div>

      <div className="relative z-10 px-6 sm:px-10 lg:flex lg:flex-1 lg:items-center lg:px-14">
        <span className="auth-skeleton absolute top-1/2 left-0 z-30 inline-flex h-11 w-11 -translate-y-1/2 rounded-full lg:left-4" />
        <span className="auth-skeleton absolute top-1/2 right-0 z-30 inline-flex h-11 w-11 -translate-y-1/2 rounded-full lg:right-4" />

        <div className="mx-auto w-full max-w-[44rem] rounded-[1.75rem] border border-white/20 bg-black/20 p-8 shadow-xl shadow-black/30 backdrop-blur-sm">
          <div className="auth-skeleton mx-auto h-11 w-56 rounded" />
          <div className="auth-skeleton mx-auto mt-5 h-32 w-40 rounded sm:h-40 sm:w-48" />
        </div>
      </div>

      <div className="relative z-20 mt-6 flex flex-wrap items-center justify-center gap-3 lg:mt-4">
        <span className="auth-skeleton h-10 w-32 rounded-full" />
        <span className="auth-skeleton h-10 w-40 rounded-full" />
      </div>
    </section>
  );
}

function DayEventsSkeleton() {
  return (
    <aside className="mx-auto w-[calc(100%-1rem)] min-h-[16rem] rounded-[1.75rem] border border-white/20 bg-black/20 p-4 shadow-xl shadow-black/30 backdrop-blur-sm sm:w-full sm:p-5">
      <div className="auth-skeleton h-4 w-36 rounded" />

      <ul className="mt-3 space-y-2 pr-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <li
            key={index}
            className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur-sm"
          >
            <div className="auth-skeleton h-5 w-24 rounded-full" />
            <div className="auth-skeleton mt-2 h-4 w-full rounded" />
            <div className="auth-skeleton mt-2 h-4 w-4/5 rounded" />
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen touch-pan-y overflow-y-auto bg-transparent px-4 py-4 sm:py-6 lg:py-4">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(21rem,24rem)] lg:items-start">
        <DayHeaderSkeleton />
        <DayNotebookSkeleton />
        <DayEventsSkeleton />
      </div>
    </main>
  );
}
