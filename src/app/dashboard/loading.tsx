function HeaderSkeleton() {
  return (
    <header className="relative z-30 rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <span className="auth-skeleton block h-10 w-48 rounded-lg" />
          <span className="auth-skeleton block h-4 w-80 rounded" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="auth-skeleton block h-11 w-56 rounded-full" />
          <span className="auth-skeleton block h-11 w-11 rounded-full" />
        </div>
      </div>
    </header>
  );
}

function ActionsSkeleton() {
  return (
    <section className="rounded-3xl border border-white/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.62)_0%,rgba(15,23,42,0.38)_100%)] p-6 shadow-[0_18px_36px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
      <div className="space-y-2">
        <span className="auth-skeleton block h-7 w-28 rounded" />
        <span className="auth-skeleton block h-4 w-96 rounded" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-white/15 bg-white/8 p-4 shadow-[0_10px_24px_rgba(2,8,23,0.28)] backdrop-blur-sm">
          <span className="auth-skeleton block h-6 w-36 rounded" />
          <span className="auth-skeleton mt-2 block h-4 w-72 rounded" />
          <div className="mt-4 space-y-2">
            <span className="auth-skeleton block h-11 w-full rounded-full" />
            <span className="auth-skeleton block h-11 w-full rounded-full" />
          </div>
        </article>

        <article className="rounded-2xl border border-white/15 bg-white/8 p-4 shadow-[0_10px_24px_rgba(2,8,23,0.28)] backdrop-blur-sm">
          <span className="auth-skeleton block h-6 w-24 rounded" />
          <span className="auth-skeleton mt-2 block h-4 w-72 rounded" />
          <div className="mt-4">
            <span className="auth-skeleton block h-11 w-full rounded-full" />
          </div>
        </article>
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <HeaderSkeleton />
        <ActionsSkeleton />
      </div>
    </main>
  );
}

