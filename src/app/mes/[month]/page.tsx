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
          <header className="gc-panel relative z-30 !p-6 sm:!p-8">
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <SectionBreadcrumb
                  items={[
                    { label: "Calendario anual", href: "/anual" },
                    { label: MONTH_NAMES[monthIndex] },
                  ]}
                  className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
                />
                <div className="gc-divider-gold mt-2" />
                <p className="mt-2 text-sm text-slate-200/85">
                  Revisa los dias y eventos del mes seleccionado.
                </p>
              </div>

              <div className="order-first z-50 flex items-center justify-end gap-2 self-end sm:order-none sm:self-auto">
                {canUploadEfemerides ? (
                  <EfemeridesSettings fallbackMonth={monthNumber} fallbackYear={YEAR} />
                ) : null}
                {session.user?.role === "CLIENTE" ? (
                  session.canExitClientMode ? (
                    <ExitClientModeButton className="gc-btn gc-btn-ghost" />
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

