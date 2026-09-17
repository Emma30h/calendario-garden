function HeaderSkeleton() {
  return (
    <header className="gc-panel relative z-30 !p-6 sm:!p-8">
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
    <section className="gc-panel !p-6 sm:!p-8">
      <div className="space-y-2">
        <span className="auth-skeleton block h-7 w-28 rounded" />
        <span className="auth-skeleton block h-4 w-96 rounded" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <article className="gc-panel gc-panel--compact relative z-10">
          <span className="auth-skeleton block h-6 w-36 rounded" />
          <span className="auth-skeleton mt-2 block h-4 w-72 rounded" />
          <div className="mt-4 space-y-2">
            <span className="auth-skeleton block h-11 w-full rounded-full" />
            <span className="auth-skeleton block h-11 w-full rounded-full" />
          </div>
        </article>

        <article className="gc-panel gc-panel--compact relative z-10">
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

