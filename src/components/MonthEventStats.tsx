"use client";

import { useEffect, useMemo, useState } from "react";
import { MONTH_NAMES, getDaysInMonth } from "@/lib/calendar";
import { subscribeToBirthdaysUpdates } from "@/lib/birthdays";
import { useCurrentDateAtMidnightRefresh } from "@/lib/useMidnightRefreshKey";
import {
  EFEMERIDES_BROADCAST_EVENT,
  type EfemerideEvent,
  type EfemeridesStoredPayload,
} from "@/lib/efemerides";

type MonthEventStatsProps = {
  year: number;
  monthNumber: number;
  className?: string;
  onDataReady?: () => void;
};

type ApiErrorResponse = {
  error: string;
};

type CurrentEfemeridesResponse = {
  data: EfemeridesStoredPayload | null;
};

type BirthdayApiRecord = {
  birthDate?: string;
  birth_date?: string;
};

type BirthdaysResponse = {
  data: BirthdayApiRecord[];
};

type LoadResult<T> = {
  data: T;
  error: string | null;
};

type MonthStats = {
  totalScheduled: number;
  upcoming: number;
  daysWithEvents: number;
  busiestDay: { day: number; count: number } | null;
  dailyCounts: number[];
  byType: {
    birthdays: number;
    anniversaries: number;
    dayEvents: number;
    others: number;
    noNews: number;
  };
  bySource: {
    efemerides: number;
    birthdaysDb: number;
  };
};

type MonthStatsState = {
  stats: MonthStats | null;
  isLoading: boolean;
  warning: string | null;
};

type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

type YAxisTick = {
  ratio: number;
  label: string;
};

function asErrorMessage(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  ) {
    return (value as { error: string }).error;
  }

  return fallback;
}

function parseIsoMonthDay(value: string) {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3) {
    return null;
  }

  const month = parts[1];
  const day = parts[2];
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { month, day };
}

function toPercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function buildConicGradient(slices: ChartSlice[]) {
  const total = slices.reduce((acc, slice) => acc + Math.max(0, slice.value), 0);
  if (total <= 0) {
    return "conic-gradient(#d7dfcc 0deg 360deg)";
  }

  let cursor = 0;
  const parts: string[] = [];

  for (const slice of slices) {
    if (slice.value <= 0) {
      continue;
    }

    const angle = (slice.value / total) * 360;
    const start = cursor;
    const end = cursor + angle;
    parts.push(`${slice.color} ${start}deg ${end}deg`);
    cursor = end;
  }

  if (cursor < 360) {
    parts.push(`#d7dfcc ${cursor}deg 360deg`);
  }

  return `conic-gradient(${parts.join(", ")})`;
}

function buildYAxisTicks(maxValue: number): YAxisTick[] {
  const ratios = [1, 0.75, 0.5, 0.25, 0];

  if (maxValue <= 0) {
    return ratios.map((ratio) => ({ ratio, label: "0" }));
  }

  return ratios.map((ratio) => ({
    ratio,
    label: String(Math.round(maxValue * ratio)),
  }));
}

function countUpcomingEvents(
  year: number,
  monthNumber: number,
  scheduledEvents: Array<{ day: number }>
) {
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;

  if (year < nowYear || (year === nowYear && monthNumber < nowMonth)) {
    return 0;
  }

  if (year > nowYear || (year === nowYear && monthNumber > nowMonth)) {
    return scheduledEvents.length;
  }

  const today = now.getDate();
  return scheduledEvents.filter((event) => event.day >= today).length;
}

function buildMonthStats(
  year: number,
  monthNumber: number,
  monthDays: number,
  efemeridesPayload: EfemeridesStoredPayload | null,
  birthdayDays: number[]
): MonthStats {
  const efemeridesEvents =
    efemeridesPayload?.events.filter(
      (event) =>
        event.year === year &&
        event.month === monthNumber &&
        event.day >= 1 &&
        event.day <= monthDays
    ) ?? [];

  const scheduledEvents: Array<{ day: number; type: EfemerideEvent["type"] }> = [];
  let birthdays = 0;
  let anniversaries = 0;
  let dayEvents = 0;
  let others = 0;
  let noNews = 0;

  for (const event of efemeridesEvents) {
    if (event.type === "sin_novedad") {
      noNews += 1;
      continue;
    }

    scheduledEvents.push({ day: event.day, type: event.type });

    if (event.type === "cumpleanos") {
      birthdays += 1;
    } else if (event.type === "aniversario") {
      anniversaries += 1;
    } else if (event.type === "dia") {
      dayEvents += 1;
    } else {
      others += 1;
    }
  }

  for (const day of birthdayDays) {
    if (!Number.isInteger(day) || day < 1 || day > monthDays) {
      continue;
    }

    scheduledEvents.push({ day, type: "cumpleanos" });
    birthdays += 1;
  }

  const eventsPerDay = new Map<number, number>();
  for (const event of scheduledEvents) {
    eventsPerDay.set(event.day, (eventsPerDay.get(event.day) ?? 0) + 1);
  }

  const busiestEntry = [...eventsPerDay.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0] - b[0];
  })[0];
  const dailyCounts = Array.from(
    { length: monthDays },
    (_, index) => eventsPerDay.get(index + 1) ?? 0
  );

  return {
    totalScheduled: scheduledEvents.length,
    upcoming: countUpcomingEvents(year, monthNumber, scheduledEvents),
    daysWithEvents: eventsPerDay.size,
    busiestDay: busiestEntry
      ? {
          day: busiestEntry[0],
          count: busiestEntry[1],
        }
      : null,
    dailyCounts,
    byType: {
      birthdays,
      anniversaries,
      dayEvents,
      others,
      noNews,
    },
    bySource: {
      efemerides: scheduledEvents.length - birthdayDays.length,
      birthdaysDb: birthdayDays.length,
    },
  };
}

async function readMonthEfemerides(
  year: number,
  monthNumber: number
): Promise<LoadResult<EfemeridesStoredPayload | null>> {
  try {
    const response = await fetch(
      `/api/efemerides/current?month=${monthNumber}&year=${year}`,
      {
        cache: "no-store",
      }
    );
    const body = (await response.json()) as CurrentEfemeridesResponse | ApiErrorResponse;

    if (!response.ok || "error" in body) {
      return {
        data: null,
        error: asErrorMessage(body, "No se pudieron leer efemérides del mes."),
      };
    }

    if (!body.data || !Array.isArray(body.data.events)) {
      return { data: null, error: null };
    }

    return { data: body.data, error: null };
  } catch {
    return {
      data: null,
      error: "No se pudieron leer efemérides del mes.",
    };
  }
}

function readBirthDate(record: BirthdayApiRecord) {
  if (typeof record.birthDate === "string") {
    return record.birthDate;
  }

  if (typeof record.birth_date === "string") {
    return record.birth_date;
  }

  return null;
}

async function readMonthBirthdayDays(
  monthNumber: number
): Promise<LoadResult<number[]>> {
  try {
    const response = await fetch("/api/birthdays", {
      cache: "no-store",
    });
    const body = (await response.json()) as BirthdaysResponse | ApiErrorResponse;

    if (!response.ok || "error" in body) {
      return {
        data: [],
        error: asErrorMessage(body, "No se pudieron leer cumpleaños del personal."),
      };
    }

    if (!Array.isArray(body.data)) {
      return { data: [], error: "Respuesta inválida de cumpleaños." };
    }

    const days = body.data
      .map((record) => {
        const birthDate = readBirthDate(record);
        if (!birthDate) {
          return null;
        }

        const parsed = parseIsoMonthDay(birthDate);
        if (!parsed || parsed.month !== monthNumber) {
          return null;
        }

        return parsed.day;
      })
      .filter((day): day is number => day !== null);

    return { data: days, error: null };
  } catch {
    return {
      data: [],
      error: "No se pudieron leer cumpleaños del personal.",
    };
  }
}

export default function MonthEventStats({
  year,
  monthNumber,
  className = "",
  onDataReady,
}: MonthEventStatsProps) {
  const now = useCurrentDateAtMidnightRefresh();
  const daysInMonth = useMemo(
    () => getDaysInMonth(year, monthNumber - 1),
    [year, monthNumber]
  );
  const [state, setState] = useState<MonthStatsState>({
    stats: null,
    isLoading: true,
    warning: null,
  });
  const currentDay =
    now.getFullYear() === year && now.getMonth() + 1 === monthNumber
      ? now.getDate()
      : null;

  useEffect(() => {
    let isMounted = true;

    const refresh = async (showLoading: boolean) => {
      if (showLoading && isMounted) {
        setState((prev) => ({ ...prev, isLoading: true, warning: null }));
      }

      const [efemeridesResult, birthdaysResult] = await Promise.all([
        readMonthEfemerides(year, monthNumber),
        readMonthBirthdayDays(monthNumber),
      ]);

      if (!isMounted) {
        return;
      }

      const warningMessages = [efemeridesResult.error, birthdaysResult.error].filter(
        (message): message is string => Boolean(message)
      );
      const warning =
        warningMessages.length > 0 ? warningMessages.join(" ") : null;

      setState({
        stats: buildMonthStats(
          year,
          monthNumber,
          daysInMonth,
          efemeridesResult.data,
          birthdaysResult.data
        ),
        isLoading: false,
        warning,
      });
      onDataReady?.();
    };

    void refresh(true);

    const onUpdated = () => {
      void refresh(false);
    };

    window.addEventListener(EFEMERIDES_BROADCAST_EVENT, onUpdated);
    const unsubscribeBirthdays = subscribeToBirthdaysUpdates(onUpdated);
    const pollingId = window.setInterval(() => {
      void refresh(false);
    }, 45000);

    return () => {
      isMounted = false;
      window.removeEventListener(EFEMERIDES_BROADCAST_EVENT, onUpdated);
      unsubscribeBirthdays();
      window.clearInterval(pollingId);
    };
  }, [year, monthNumber, daysInMonth, onDataReady]);

  if (state.isLoading && !state.stats) {
    return (
      <section
        className={`rounded-2xl border border-white/20 bg-black/20 p-5 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-6 ${className}`}
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-300/75">
          Estadísticas del mes
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`stats-skeleton-${index}`}
              className="auth-skeleton h-[5.25rem] rounded-xl"
            />
          ))}
        </div>
      </section>
    );
  }

  const stats =
    state.stats ??
    buildMonthStats(year, monthNumber, daysInMonth, null, []);

  const summaryCards = [
    { label: "Eventos previstos", value: String(stats.totalScheduled) },
    { label: "Por ocurrir", value: String(stats.upcoming) },
    { label: "Días con eventos", value: `${stats.daysWithEvents}/${daysInMonth}` },
    {
      label: "Día más cargado",
      value: stats.busiestDay
        ? `${stats.busiestDay.day} (${stats.busiestDay.count})`
        : "Sin eventos",
    },
    { label: "Cumpleaños", value: String(stats.byType.birthdays) },
    { label: "Aniversarios", value: String(stats.byType.anniversaries) },
    { label: "Días institucionales", value: String(stats.byType.dayEvents) },
    { label: "Otros", value: String(stats.byType.others) },
    { label: "Sin novedad", value: String(stats.byType.noNews) },
  ];
  const typeSlices: ChartSlice[] = [
    { label: "Cumpleaños", value: stats.byType.birthdays, color: "#2f7d32" },
    { label: "Aniversarios", value: stats.byType.anniversaries, color: "#1f5f97" },
    { label: "Días", value: stats.byType.dayEvents, color: "#b7791f" },
    { label: "Otros", value: stats.byType.others, color: "#6b7280" },
    { label: "Sin novedad", value: stats.byType.noNews, color: "#9ca3af" },
  ];
  const typeTotal = typeSlices.reduce((acc, slice) => acc + slice.value, 0);
  const donutBackground = buildConicGradient(typeSlices);
  const maxTypeCount = typeSlices.reduce(
    (max, slice) => Math.max(max, slice.value),
    0
  );
  const maxDailyCount = stats.dailyCounts.reduce(
    (max, count) => Math.max(max, count),
    0
  );
  const yAxisTicks = buildYAxisTicks(maxDailyCount);
  const dailyItems = stats.dailyCounts.map((count, index) => ({
    day: index + 1,
    count,
  }));
  const topDailyItems = [...dailyItems]
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.day - b.day;
    })
    .slice(0, 6);

  return (
    <section
      className={`rounded-2xl border border-black/10 bg-white p-5 shadow-lg shadow-black/5 sm:p-6 ${className}`}
      aria-live="polite"
    >
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-black/45">
          Estadísticas del mes
        </p>
        <h2 className="mt-1 text-xl font-bold text-[#22331d] sm:text-2xl">
          Resumen de {MONTH_NAMES[monthNumber - 1]} {year}
        </h2>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((item) => (
          <article
            key={item.label}
            className="rounded-xl border border-black/10 bg-[#f8fbf4] p-3.5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
              {item.label}
            </p>
            <p className="mt-1 text-xl font-black text-[#13210f] sm:text-2xl">{item.value}</p>
          </article>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <article className="rounded-xl border border-black/10 bg-[#f8fbf4] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Gráfico por tipo
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className="relative mx-auto h-32 w-32 shrink-0 rounded-full border border-black/10 sm:mx-0 sm:h-36 sm:w-36"
              style={{ background: donutBackground }}
              aria-label="Distribución de eventos por tipo"
              role="img"
            >
              <div className="absolute inset-[1.05rem] flex flex-col items-center justify-center rounded-full bg-white text-center">
                <span className="text-xl font-black text-[#13210f] sm:text-2xl">
                  {stats.totalScheduled}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                  eventos
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              {typeSlices.map((slice) => (
                <div
                  key={slice.label}
                  className="flex items-center justify-between gap-2 text-xs sm:text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-black/75">{slice.label}</span>
                  </div>
                  <span className="min-w-[4.5rem] shrink-0 text-right font-semibold tabular-nums text-black/80">
                    {slice.value} ({toPercent(slice.value, typeTotal)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-black/10 bg-[#f8fbf4] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Gráfico por día
          </p>
          <p className="mt-1 text-xs text-black/60">
            Barras diarias de actividad para {MONTH_NAMES[monthNumber - 1]}.
          </p>

          <div className="mt-3 sm:hidden">
            {topDailyItems.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-black/8 bg-white p-3">
                {topDailyItems.map((item) => {
                  const widthPercent =
                    maxDailyCount <= 0
                      ? 0
                      : Math.max(10, Math.round((item.count / maxDailyCount) * 100));
                  const isToday = currentDay === item.day;

                  return (
                    <div key={`top-day-${item.day}`} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-[11px] font-semibold text-black/60">
                        Día {item.day}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-black/10">
                        <div
                          className={`h-2 rounded-full ${
                            isToday ? "bg-[#dc2f45]" : "bg-[#2f7d32]/80"
                          }`}
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-black/80">
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-black/8 bg-white px-3 py-2 text-xs text-black/60">
                No hay eventos cargados para este mes.
              </p>
            )}
          </div>

          <div className="mt-3 hidden sm:block">
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
              <div className="relative h-32">
                {yAxisTicks.map((tick) => (
                  <span
                    key={`y-tick-${tick.ratio}`}
                    className="absolute right-0 -translate-y-1/2 text-[10px] font-semibold text-black/45"
                    style={{ top: `${(1 - tick.ratio) * 100}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>

              <div className="relative h-32 overflow-hidden rounded-lg border border-black/8 bg-white px-1.5 pb-1.5 pt-2">
                {yAxisTicks
                  .filter((tick) => tick.ratio > 0)
                  .map((tick) => (
                    <span
                      key={`guide-line-${tick.ratio}`}
                      className="pointer-events-none absolute left-1.5 right-1.5 border-t border-dashed border-black/15"
                      style={{ top: `${(1 - tick.ratio) * 100}%` }}
                      aria-hidden="true"
                    />
                  ))}

                <div className="relative z-10 flex h-full items-end gap-[2px]">
                  {stats.dailyCounts.map((count, index) => {
                    const day = index + 1;
                    const heightPercent =
                      count <= 0 || maxDailyCount <= 0
                        ? 8
                        : Math.max(12, Math.round((count / maxDailyCount) * 100));
                    const isToday = currentDay === day;

                    return (
                      <div
                        key={`day-chart-${day}`}
                        className="group relative flex h-full min-w-0 flex-1 items-end"
                        aria-label={`Día ${day}: ${count} eventos`}
                        role="img"
                      >
                        <span
                          className={`block w-full rounded-t-sm ${
                            count === 0
                              ? "bg-black/15"
                              : isToday
                                ? "bg-[#dc2f45]"
                                : "bg-[#2f7d32]/80"
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />
                        <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-black px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block">
                          {day}: {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-black/40">
              <span>Día 1</span>
              <span>Día {Math.ceil(daysInMonth / 2)}</span>
              <span>Día {daysInMonth}</span>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {typeSlices.map((slice) => {
              const widthPercent =
                slice.value <= 0 || maxTypeCount <= 0
                  ? 0
                  : Math.max(4, Math.round((slice.value / maxTypeCount) * 100));

              return (
                <div key={`bar-${slice.label}`}>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-black/50">
                    <span>{slice.label}</span>
                    <span>{slice.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/10">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${widthPercent}%`,
                        backgroundColor: slice.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <p className="mt-4 text-xs text-black/60">
        Fuentes: {stats.bySource.efemerides} eventos de efemérides +{" "}
        {stats.bySource.birthdaysDb} cumpleaños de Garden DB.
      </p>

      {state.warning ? (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {state.warning}
        </p>
      ) : null}
    </section>
  );
}
