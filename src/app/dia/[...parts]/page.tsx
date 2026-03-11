import { redirect } from "next/navigation";
import { parseDayNumber, parseMonthNumber } from "@/lib/calendar";

type DayAliasPageProps = {
  params: Promise<{
    parts: string[];
  }>;
};

const MARCH_DEFAULT = 3;
const MARCH_MAX_DAY = 31;

export default async function DayAliasPage({ params }: DayAliasPageProps) {
  const { parts } = await params;

  if (parts.length === 1) {
    const day = parseDayNumber(parts[0], MARCH_MAX_DAY);

    if (!day) {
      redirect(`/mes/${MARCH_DEFAULT}`);
    }

    redirect(`/mes/${MARCH_DEFAULT}/dia/${day}`);
  }

  if (parts.length === 2) {
    const month = parseMonthNumber(parts[0]);
    const day = Number(parts[1]);

    if (!month || !Number.isInteger(day)) {
      redirect(`/mes/${MARCH_DEFAULT}`);
    }

    redirect(`/mes/${month}/dia/${day}`);
  }

  redirect(`/mes/${MARCH_DEFAULT}`);
}
