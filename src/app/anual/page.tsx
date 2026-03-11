import Link from "next/link";
import { redirect } from "next/navigation";
import ExitClientModeButton from "@/components/ExitClientModeButton";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import UserNavbar from "@/components/UserNavbar";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";
import {
  COMPACT_WEEK_DAYS,
  MONTH_NAMES,
  YEAR,
  buildMonthCells,
} from "@/lib/calendar";

export default async function AnnualPage() {
  const session = await getSessionViewFromServerCookies();
  if (!session.authenticated) {
    redirect("/auth/login?next=/anual");
  }

  const today = new Date();

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

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBreadcrumb
                items={[
                  { label: "Inicio", href: "/" },
                  { label: "Calendario anual" },
                ]}
                className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
              />
              <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
                Calendario anual {YEAR}
              </h1>
              <p className="mt-1 text-sm text-slate-200/85">
                Hace clic en un mes para abrir su vista mensual.
              </p>
            </div>
            <div className="order-first z-50 flex self-end sm:order-none sm:self-auto sm:items-end">
              {session.user?.role === "CLIENTE" ? (
                session.canExitClientMode ? (
                  <ExitClientModeButton className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 text-sm font-semibold text-slate-100/90 shadow-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60" />
                ) : null
              ) : (
                <UserNavbar
                  className="z-50"
                  email={session.user?.email}
                  role={session.user?.role}
                  firstName={session.user?.firstName}
                  lastName={session.user?.lastName}
                  hierarchy={session.user?.hierarchy}
                  personalType={session.user?.personalType}
                  showInlineIdentity
                />
              )}
            </div>
          </div>
        </header>

        <section className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MONTH_NAMES.map((monthName, monthIndex) => {
            const cells = buildMonthCells(YEAR, monthIndex);
            const monthNumber = monthIndex + 1;

            return (
              <Link
                key={monthName}
                href={`/mes/${monthNumber}`}
                className="rounded-2xl border border-white/20 bg-black/20 p-4 shadow-xl shadow-black/30 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-sky-300/35 hover:bg-white/10"
              >
                <h2 className="mb-2 text-base font-bold text-slate-100">
                  {monthName}
                </h2>

                <div className="mb-1 grid grid-cols-7 text-center text-[0.65rem] font-semibold text-slate-300/70">
                  {COMPACT_WEEK_DAYS.map((dayName) => (
                    <span key={`${monthName}-${dayName}`} className="py-1">
                      {dayName}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {cells.map((day, index) => {
                    if (!day) {
                      return (
                        <span
                          key={`${monthName}-empty-${index}`}
                          className="h-7 w-full rounded-md"
                        />
                      );
                    }

                    const isToday =
                      today.getFullYear() === YEAR &&
                      today.getMonth() === monthIndex &&
                      today.getDate() === day;

                    return (
                      <span
                        key={`${monthName}-${day}`}
                        className={`inline-flex h-7 items-center justify-center text-xs font-medium ${
                          isToday
                            ? "rounded-full border border-sky-300/70 bg-sky-300/15 text-sky-100"
                            : "text-slate-200/85"
                        }`}
                      >
                        {day}
                      </span>
                    );
                  })}
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}

