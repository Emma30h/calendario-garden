import { notFound } from "next/navigation";
import ExitClientModeButton from "@/components/ExitClientModeButton";
import MonthCalendar from "@/components/MonthCalendar";
import MonthStatsPanel from "@/components/MonthStatsPanel";
import EfemeridesSettings from "@/components/EfemeridesSettings";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import UserNavbar from "@/components/UserNavbar";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";
import { MONTH_NAMES, YEAR, parseMonthNumber } from "@/lib/calendar";

type MonthPageProps = {
  params: Promise<{
    month: string;
  }>;
};

export default async function MonthPage({ params }: MonthPageProps) {
  const session = await getSessionViewFromServerCookies();
  const canUploadEfemerides = session.permissions?.canUploadEfemeridesPdf === true;

  const { month } = await params;
  const monthNumber = parseMonthNumber(month);

  if (!monthNumber) {
    notFound();
  }

  const monthIndex = monthNumber - 1;

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6 lg:min-h-[100dvh] lg:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="space-y-4 lg:flex lg:h-[calc(100dvh-3rem)] lg:flex-col lg:gap-4 lg:space-y-0">
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
                    { label: "Calendario anual", href: "/anual" },
                    { label: MONTH_NAMES[monthIndex] },
                  ]}
                  className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
                />
                <p className="mt-1 text-sm text-slate-200/85">
                  Revisa los dias y eventos del mes seleccionado.
                </p>
              </div>

              <div className="order-first z-50 flex items-center justify-end gap-2 self-end sm:order-none sm:self-auto">
                {canUploadEfemerides ? (
                  <EfemeridesSettings fallbackMonth={monthNumber} fallbackYear={YEAR} />
                ) : null}
                {session.user?.role === "CLIENTE" ? (
                  session.canExitClientMode ? (
                    <ExitClientModeButton className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 bg-white/10 px-4 text-sm font-semibold text-slate-100/90 shadow-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60" />
                  ) : null
                ) : (
                  <UserNavbar
                    className="z-50"
                    email={session.user?.email}
                    role={session.user?.role}
                  />
                )}
              </div>
            </div>
          </header>

          <MonthCalendar
            year={YEAR}
            monthIndex={monthIndex}
            className="lg:flex-1 lg:min-h-0"
          />
        </section>

        <MonthStatsPanel year={YEAR} monthNumber={monthNumber} />
      </div>
    </main>
  );
}

