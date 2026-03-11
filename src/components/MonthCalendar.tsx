"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MONTH_NAMES, WEEK_DAYS, buildMonthCells } from "@/lib/calendar";
import { useCurrentDateAtMidnightRefresh } from "@/lib/useMidnightRefreshKey";

type MonthCalendarProps = {
  year: number;
  monthIndex: number;
  className?: string;
};

export default function MonthCalendar({
  year,
  monthIndex,
  className = "",
}: MonthCalendarProps) {
  const router = useRouter();
  const now = useCurrentDateAtMidnightRefresh();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const monthCells = useMemo(
    () => buildMonthCells(year, monthIndex),
    [year, monthIndex]
  );
  const monthWeeks = useMemo(() => {
    const rows: Array<Array<number | null>> = [];
    for (let index = 0; index < monthCells.length; index += 7) {
      rows.push(monthCells.slice(index, index + 7));
    }
    return rows;
  }, [monthCells]);
  const desktopCellHeightClass =
    monthWeeks.length >= 6
      ? "lg:h-[clamp(3.9rem,5.8vh,5.2rem)]"
      : "lg:h-[clamp(4.4rem,6.6vh,5.2rem)]";
  const currentDay =
    now.getFullYear() === year && now.getMonth() === monthIndex ? now.getDate() : null;

  const openDay = (day: number) => {
    router.push(`/mes/${monthIndex + 1}/dia/${day}`);
  };

  const handleDayClick = (day: number) => {
    const isCoarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (isCoarsePointer) {
      openDay(day);
      return;
    }

    setSelectedDay(day);
  };

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-5 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8 lg:flex lg:min-h-0 lg:flex-col ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-indigo-300/10 blur-3xl"
      />

      <header className="mb-5 lg:mb-4">
        <h1 className="relative text-3xl font-bold text-slate-100 sm:text-4xl">
          {MONTH_NAMES[monthIndex]} {year}
        </h1>
        <p className="relative mt-1 text-sm text-slate-200/85 sm:hidden">
          Toca un día para abrir la vista diaria.
        </p>
        <p className="relative mt-1 hidden text-sm text-slate-200/85 sm:block">
          Hace clic para seleccionar un día. Hace doble clic para abrir la vista diaria.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-slate-200/75 bg-[#f8fbff] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] lg:flex-1 lg:min-h-0">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              {WEEK_DAYS.map((dayName, index) => {
                const isWeekend = index === 0 || index === 6;
                return (
                  <th
                    key={dayName}
                    scope="col"
                    className={`border border-slate-200 bg-[#edf4ff] py-2 text-center text-[0.72rem] font-bold uppercase tracking-wide text-[#1f3a5a] lg:py-1.5 ${
                      isWeekend ? "text-[#1d4f7a]" : ""
                    }`}
                  >
                    {dayName}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {monthWeeks.map((week, weekIndex) => (
              <tr key={`week-row-${weekIndex}`}>
                {week.map((day, dayIndex) => {
                  const cellIndex = weekIndex * 7 + dayIndex;
                  const isWeekend = dayIndex === 0 || dayIndex === 6;

                  if (!day) {
                    return (
                      <td
                        key={`empty-${cellIndex}`}
                        className={`h-[4.8rem] border border-slate-200 bg-[#f1f6ff] align-top ${desktopCellHeightClass}`}
                      />
                    );
                  }

                  const isSelected = day === selectedDay;
                  const isToday = day === currentDay;

                  return (
                    <td
                      key={`day-${day}`}
                      className={`h-[4.8rem] border border-slate-200 bg-white p-0 align-top ${desktopCellHeightClass}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleDayClick(day)}
                        onDoubleClick={() => openDay(day)}
                        className={`relative flex h-full w-full items-start justify-start p-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/70 ${
                          isSelected
                            ? "bg-[linear-gradient(160deg,#dbeafe_0%,#bfdbfe_100%)] text-[#0f2f53] shadow-[inset_0_0_0_2px_rgba(59,130,246,0.38)]"
                            : "text-[#26384a] hover:bg-[#eff6ff]"
                        }`}
                        aria-label={`Día ${day} de ${MONTH_NAMES[monthIndex].toLowerCase()} de ${year}`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-base font-semibold lg:h-8 lg:w-8 ${
                            isToday
                              ? "border-2 border-blue-500/80 bg-white/85 text-blue-700"
                              : isWeekend
                                ? "text-[#506178]"
                                : ""
                          }`}
                        >
                          {day}
                        </span>
                        {isToday ? (
                          <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-blue-500/80" />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


