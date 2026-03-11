import { notFound } from "next/navigation";
import DayFlipViewer from "@/components/DayFlipViewer";
import { getSessionViewFromServerCookies } from "@/lib/auth/server-auth";
import { YEAR, getDaysInMonth, parseDayNumber, parseMonthNumber } from "@/lib/calendar";

type DayPageProps = {
  params: Promise<{
    month: string;
    day: string;
  }>;
};

export default async function DayPage({ params }: DayPageProps) {
  const session = await getSessionViewFromServerCookies();
  const { month, day } = await params;
  const monthNumber = parseMonthNumber(month);

  if (!monthNumber) {
    notFound();
  }

  const maxDay = getDaysInMonth(YEAR, monthNumber - 1);
  const dayNumber = parseDayNumber(day, maxDay);

  if (!dayNumber) {
    notFound();
  }

  return (
    <DayFlipViewer
      year={YEAR}
      monthNumber={monthNumber}
      dayNumber={dayNumber}
      canExitClientMode={session.canExitClientMode}
    />
  );
}
