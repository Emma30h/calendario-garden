"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MONTH_NAMES } from "@/lib/calendar";
import ExitClientModeButton from "@/components/ExitClientModeButton";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import {
  EFEMERIDES_BROADCAST_EVENT,
  type EfemerideEvent,
  type EfemerideType,
  type EfemeridesStoredPayload,
} from "@/lib/efemerides";
import { subscribeToBirthdaysUpdates } from "@/lib/birthdays";
import EfemeridesDayPanel from "@/components/EfemeridesDayPanel";
import styles from "./DayFlipViewer.module.css";

type DayFlipViewerProps = {
  year: number;
  monthNumber: number;
  dayNumber: number;
  canExitClientMode?: boolean;
};

type Direction = "prev" | "next";

type DayReference = {
  monthNumber: number;
  dayNumber: number;
};

type AnimationState = {
  direction: Direction;
  target: DayReference;
  source: DayReference;
};

type CurrentEfemeridesResponse = {
  data: EfemeridesStoredPayload | null;
};

type ApiErrorResponse = {
  error: string;
};

type MonthEfemeridesState = {
  key: string;
  data: EfemeridesStoredPayload | null;
  isLoading: boolean;
};

type BirthdayPersonalInfo =
  | {
      category: "Policial";
      policial?: "Oficial" | "Suboficial" | "Tecnico" | "Civil";
      oficialCategory?: string;
      suboficialCategory?: string;
    }
  | { category: "Civil" | "Gobierno" };

type BirthdayRecord = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  area?: string;
  turno?: string;
  personal: BirthdayPersonalInfo;
};

type BirthdaysResponse = {
  data: BirthdayRecord[];
};

type DayBirthdaysState = {
  key: string;
  data: BirthdayRecord[];
  isLoading: boolean;
};

const monthEfemeridesCache = new Map<string, EfemeridesStoredPayload | null>();
const dayBirthdaysCache = new Map<string, BirthdayRecord[]>();
const EVENT_TYPE_PRIORITY: Record<EfemerideType, number> = {
  aniversario: 0,
  cumpleanos: 1,
  dia: 2,
  otro: 3,
  sin_novedad: 4,
};
const DMCA_AREA = "D.M.C.A (Dirección Monitoreo Cordobeses en Alerta)";
const ALERTA_CIUDADANA_AREA = "Departamento Alerta Ciudadana";
const ALERTA_CIUDADANA_TURNOS = new Set(["A", "B", "C", "D", "E", "F"]);

function buildAreaLabel(areaValue?: string, turnoValue?: string) {
  const area = areaValue?.trim().toLocaleLowerCase("es-AR") ?? "";
  const turno = turnoValue?.trim().toLocaleUpperCase("es-AR") ?? "";

  const isDmca =
    area === DMCA_AREA.toLocaleLowerCase("es-AR") || area.includes("d.m.c.a");
  if (isDmca) {
    return "D.M.C.A";
  }

  const isAlertaCiudadana =
    area === ALERTA_CIUDADANA_AREA.toLocaleLowerCase("es-AR");
  if (!isAlertaCiudadana) {
    return "";
  }

  if (ALERTA_CIUDADANA_TURNOS.has(turno)) {
    return `TURNO ${turno}`;
  }

  return "ALERTA CIUDADANA";
}

function monthCacheKey(year: number, monthNumber: number) {
  return `${year}-${monthNumber}`;
}

function dayCacheKey(monthNumber: number, dayNumber: number) {
  return `${monthNumber}-${dayNumber}`;
}

function getAdjacentWithinYear(
  year: number,
  monthNumber: number,
  dayNumber: number,
  deltaDays: number
) {
  const date = new Date(year, monthNumber - 1, dayNumber);
  date.setDate(date.getDate() + deltaDays);

  if (date.getFullYear() !== year) {
    return null;
  }

  return {
    monthNumber: date.getMonth() + 1,
    dayNumber: date.getDate(),
  };
}

function dayPath(reference: DayReference) {
  return `/mes/${reference.monthNumber}/dia/${reference.dayNumber}`;
}

async function readServerEfemerides(
  year: number,
  monthNumber: number
): Promise<EfemeridesStoredPayload | null> {
  try {
    const response = await fetch(
      `/api/efemerides/current?month=${monthNumber}&year=${year}`,
      {
        cache: "no-store",
      }
    );
    const data = (await response.json()) as
      | CurrentEfemeridesResponse
      | ApiErrorResponse;

    if (!response.ok || "error" in data) {
      return null;
    }

    if (!data.data || !Array.isArray(data.data.events)) {
      return null;
    }

    return data.data;
  } catch {
    return null;
  }
}

async function readServerBirthdays(
  monthNumber: number,
  dayNumber: number
): Promise<BirthdayRecord[]> {
  try {
    const params = new URLSearchParams({
      month: String(monthNumber),
      day: String(dayNumber),
    });
    const response = await fetch(`/api/birthdays?${params.toString()}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as BirthdaysResponse | ApiErrorResponse;

    if (!response.ok || "error" in data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.filter((item) => {
      const rawPersonal = (item as { personal?: unknown }).personal;
      const hasValidPersonal =
        typeof rawPersonal === "object" &&
        rawPersonal !== null &&
        typeof (rawPersonal as { category?: unknown }).category === "string";

      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { firstName?: unknown }).firstName === "string" &&
        typeof (item as { lastName?: unknown }).lastName === "string" &&
        typeof (item as { birthDate?: unknown }).birthDate === "string" &&
        hasValidPersonal
      );
    });
  } catch {
    return [];
  }
}

function birthdayTitle(record: BirthdayRecord) {
  const fullName = `${record.firstName} ${record.lastName}`.toLocaleUpperCase(
    "es-AR"
  );
  const areaLabel = buildAreaLabel(record.area, record.turno);
  const withArea = (title: string) =>
    areaLabel ? `${title} - ${areaLabel}` : title;

  if (record.personal.category === "Policial") {
    const roleDetail = (() => {
      const { policial, oficialCategory, suboficialCategory } = record.personal;
      if (!policial) {
        return null;
      }

      if (policial === "Oficial" && oficialCategory) {
        return oficialCategory;
      }

      if (policial === "Suboficial" && suboficialCategory) {
        return suboficialCategory;
      }

      if (policial === "Tecnico" && suboficialCategory) {
        return `${suboficialCategory} Técnico`;
      }

      return policial === "Tecnico" ? "Técnico" : policial;
    })();

    if (roleDetail) {
      return withArea(
        `CUMPLEA\u00d1OS DE ${roleDetail.toLocaleUpperCase("es-AR")} ${fullName}`
      );
    }
  }

  if (record.personal.category === "Civil") {
    return withArea(`CUMPLEA\u00d1OS DE PERSONAL CIVIL ${fullName}`);
  }

  return withArea(`CUMPLEA\u00d1OS DE ${fullName}`);
}

function DaySheetContent({
  monthNumber,
  dayNumber,
  year,
}: Pick<DayFlipViewerProps, "monthNumber" | "dayNumber" | "year">) {
  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 text-center sm:px-6">
      <p className="text-xl font-semibold leading-tight text-[#1f3a5a] sm:text-3xl lg:text-4xl">
        {MONTH_NAMES[monthNumber - 1]} {year}
      </p>
      <p className="mt-2 text-[clamp(3.6rem,14vw,10rem)] font-black leading-none text-[#10243f] sm:mt-4">
        {dayNumber}
      </p>
    </div>
  );
}

export default function DayFlipViewer({
  year,
  monthNumber,
  dayNumber,
  canExitClientMode = false,
}: DayFlipViewerProps) {
  const router = useRouter();
  const cacheKey = useMemo(
    () => monthCacheKey(year, monthNumber),
    [year, monthNumber]
  );
  const birthdaysKey = useMemo(
    () => dayCacheKey(monthNumber, dayNumber),
    [monthNumber, dayNumber]
  );
  const cachedMonthEfemerides = monthEfemeridesCache.has(cacheKey)
    ? monthEfemeridesCache.get(cacheKey) ?? null
    : undefined;
  const cachedDayBirthdays = dayBirthdaysCache.has(birthdaysKey)
    ? dayBirthdaysCache.get(birthdaysKey) ?? []
    : undefined;
  const pendingTargetRef = useRef<DayReference | null>(null);
  const calendarSectionRef = useRef<HTMLElement | null>(null);
  const [animation, setAnimation] = useState<AnimationState | null>(null);
  const [calendarPanelHeight, setCalendarPanelHeight] = useState(0);
  const [monthEfemeridesState, setMonthEfemeridesState] =
    useState<MonthEfemeridesState>(() => ({
      key: cacheKey,
      data: cachedMonthEfemerides ?? null,
      isLoading: cachedMonthEfemerides === undefined,
    }));
  const [dayBirthdaysState, setDayBirthdaysState] = useState<DayBirthdaysState>(
    () => ({
      key: birthdaysKey,
      data: cachedDayBirthdays ?? [],
      isLoading: cachedDayBirthdays === undefined,
    })
  );
  const activeAnimation =
    animation &&
    animation.source.monthNumber === monthNumber &&
    animation.source.dayNumber === dayNumber
      ? animation
      : null;
  const activeMonthEfemeridesState =
    monthEfemeridesState.key === cacheKey
      ? monthEfemeridesState
      : {
          key: cacheKey,
          data: cachedMonthEfemerides ?? null,
          isLoading: cachedMonthEfemerides === undefined,
        };
  const activeDayBirthdaysState =
    dayBirthdaysState.key === birthdaysKey
      ? dayBirthdaysState
      : {
          key: birthdaysKey,
          data: cachedDayBirthdays ?? [],
          isLoading: cachedDayBirthdays === undefined,
        };
  const isLoadingEvents =
    activeMonthEfemeridesState.isLoading || activeDayBirthdaysState.isLoading;
  const monthEfemerides = activeMonthEfemeridesState.data;
  const birthdaysOfDay = activeDayBirthdaysState.data;
  const prevDay = useMemo(
    () => getAdjacentWithinYear(year, monthNumber, dayNumber, -1),
    [year, monthNumber, dayNumber]
  );
  const nextDay = useMemo(
    () => getAdjacentWithinYear(year, monthNumber, dayNumber, 1),
    [year, monthNumber, dayNumber]
  );
  const efemeridesEventsOfDay = useMemo(() => {
    if (!monthEfemerides) {
      return [];
    }

    return monthEfemerides.events.filter(
      (event) =>
        event.year === year &&
        event.month === monthNumber &&
        event.day === dayNumber
    );
  }, [monthEfemerides, year, monthNumber, dayNumber]);
  const birthdayEventsOfDay = useMemo<EfemerideEvent[]>(
    () =>
      birthdaysOfDay.map((record) => ({
        id: `birthday-${record.id}`,
        year,
        month: monthNumber,
        day: dayNumber,
        type: "cumpleanos",
        title: birthdayTitle(record),
        birthdayId: record.id,
        areaLabel: buildAreaLabel(record.area, record.turno) || undefined,
      })),
    [birthdaysOfDay, year, monthNumber, dayNumber]
  );
  const eventsOfDay = useMemo<EfemerideEvent[]>(
    () =>
      [...efemeridesEventsOfDay, ...birthdayEventsOfDay]
        .map((event, index) => ({ event, index }))
        .sort((a, b) => {
          const priorityDiff =
            EVENT_TYPE_PRIORITY[a.event.type] - EVENT_TYPE_PRIORITY[b.event.type];

          if (priorityDiff !== 0) {
            return priorityDiff;
          }

          return a.index - b.index;
        })
        .map((item) => item.event),
    [efemeridesEventsOfDay, birthdayEventsOfDay]
  );
  const importSources: string[] = [];
  if (monthEfemerides?.sourceName) {
    importSources.push(monthEfemerides.sourceName);
  }
  if (birthdaysOfDay.length > 0) {
    importSources.push("Garden DB");
  }
  const dayPanelStyle =
    calendarPanelHeight > 0
      ? ({
          ["--day-panel-max-height" as const]: `${calendarPanelHeight}px`,
        } as CSSProperties)
      : undefined;

  useEffect(() => {
    const element = calendarSectionRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateHeight = () => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height);
      setCalendarPanelHeight((previous) =>
        previous === nextHeight ? previous : nextHeight
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [monthNumber, dayNumber]);

  useEffect(() => {
    if (prevDay) {
      router.prefetch(dayPath(prevDay));
    }
    if (nextDay) {
      router.prefetch(dayPath(nextDay));
    }
  }, [router, prevDay, nextDay]);

  useEffect(() => {
    pendingTargetRef.current = null;
  }, [monthNumber, dayNumber]);

  useEffect(() => {
    let isMounted = true;
    const hasCachedForMonth = monthEfemeridesCache.has(cacheKey);

    const refreshEvents = async (showSkeleton = false) => {
      if (showSkeleton && isMounted) {
        setMonthEfemeridesState((prev) => {
          if (prev.key !== cacheKey) {
            return prev;
          }

          return { ...prev, isLoading: true };
        });
      }

      const imported = await readServerEfemerides(year, monthNumber);

      if (!isMounted) {
        return;
      }

      monthEfemeridesCache.set(cacheKey, imported);
      setMonthEfemeridesState({
        key: cacheKey,
        data: imported,
        isLoading: false,
      });
    };

    void refreshEvents(!hasCachedForMonth);

    const onUpdated = () => {
      void refreshEvents(false);
    };

    window.addEventListener(EFEMERIDES_BROADCAST_EVENT, onUpdated);

    // Polling liviano para reflejar cargas hechas por otros clientes.
    const pollingId = window.setInterval(() => {
      void refreshEvents(false);
    }, 30000);

    return () => {
      isMounted = false;
      window.removeEventListener(EFEMERIDES_BROADCAST_EVENT, onUpdated);
      window.clearInterval(pollingId);
    };
  }, [year, monthNumber, cacheKey]);

  useEffect(() => {
    let isMounted = true;
    const hasCachedForDay = dayBirthdaysCache.has(birthdaysKey);

    const refreshBirthdays = async (showSkeleton = false) => {
      if (showSkeleton && isMounted) {
        setDayBirthdaysState((prev) => {
          if (prev.key !== birthdaysKey) {
            return prev;
          }

          return { ...prev, isLoading: true };
        });
      }

      const records = await readServerBirthdays(monthNumber, dayNumber);

      if (!isMounted) {
        return;
      }

      dayBirthdaysCache.set(birthdaysKey, records);
      setDayBirthdaysState({
        key: birthdaysKey,
        data: records,
        isLoading: false,
      });
    };

    void refreshBirthdays(!hasCachedForDay);

    const onUpdated = () => {
      dayBirthdaysCache.clear();
      void refreshBirthdays(false);
    };
    const unsubscribe = subscribeToBirthdaysUpdates(onUpdated);

    const pollingId = window.setInterval(() => {
      void refreshBirthdays(false);
    }, 30000);

    return () => {
      isMounted = false;
      unsubscribe();
      window.clearInterval(pollingId);
    };
  }, [monthNumber, dayNumber, birthdaysKey]);

  function handleFlip(direction: Direction) {
    if (activeAnimation) {
      return;
    }

    const target = direction === "prev" ? prevDay : nextDay;
    if (!target) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      router.replace(dayPath(target), { scroll: false });
      return;
    }

    pendingTargetRef.current = target;
    setAnimation({
      direction,
      target,
      source: { monthNumber, dayNumber },
    });
  }

  function handleAnimationEnd() {
    if (!activeAnimation) {
      return;
    }

    const target = pendingTargetRef.current ?? activeAnimation.target;
    pendingTargetRef.current = null;
    router.replace(dayPath(target), { scroll: false });
  }

  const baseReference =
    activeAnimation?.direction === "next"
      ? activeAnimation.target
      : { monthNumber, dayNumber };

  const flipReference =
    activeAnimation?.direction === "next"
      ? { monthNumber, dayNumber }
      : activeAnimation?.target;

  return (
    <main className="min-h-screen touch-pan-y overflow-y-auto bg-transparent px-4 py-4 sm:py-6 lg:py-4">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(21rem,24rem)] lg:items-start">
        <header className="relative mx-auto w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] px-4 py-3 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:w-full sm:px-6 sm:py-4 lg:col-span-2 lg:mx-0 lg:w-auto lg:max-w-none">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <SectionBreadcrumb
            items={[
              { label: "Calendario anual", href: "/anual" },
              { label: MONTH_NAMES[monthNumber - 1], href: `/mes/${monthNumber}` },
              { label: `Día ${dayNumber}` },
            ]}
            className="relative text-slate-400/90 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-400/90"
          />
        </header>
        <section
          ref={calendarSectionRef}
          className="relative mx-auto w-[calc(100%-1rem)] max-w-3xl shrink-0 overflow-hidden rounded-[2rem] border border-white/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] pb-5 pt-12 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:w-full sm:pb-8 sm:pt-[3.75rem] lg:mx-auto lg:flex lg:flex-col lg:pb-6 lg:pt-16"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -bottom-24 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <div className="absolute inset-x-0 top-0 h-12 rounded-t-[2rem] bg-[linear-gradient(90deg,rgba(186,230,253,0.38)_0%,rgba(147,197,253,0.2)_100%)]" />
          <div className="absolute inset-x-0 top-3 z-30 flex justify-center gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <span
                key={index}
                className="h-6 w-4 rounded-b-full border-2 border-white/45 bg-white/90"
              />
            ))}
          </div>

          <div
            className={`relative z-10 px-4 sm:px-10 lg:flex lg:flex-1 lg:items-center lg:px-14 ${styles.viewerPerspective}`}
          >
            {prevDay ? (
              <button
                type="button"
                aria-label={`Ir al día anterior: ${prevDay.dayNumber} de ${MONTH_NAMES[prevDay.monthNumber - 1]}`}
                onClick={() => handleFlip("prev")}
                disabled={Boolean(activeAnimation)}
                className="absolute inset-y-0 left-0 z-30 my-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/60 text-slate-100 shadow-md shadow-black/30 transition hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-11 lg:left-4"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-4 w-4 sm:h-5 sm:w-5"
                  aria-hidden="true"
                >
                  <path
                    d="m12.5 5.5-5 4.5 5 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <span
                className="absolute inset-y-0 left-0 z-30 my-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-900/35 text-slate-300/45 sm:h-11 sm:w-11 lg:left-4"
                aria-hidden="true"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 sm:h-5 sm:w-5">
                  <path
                    d="m12.5 5.5-5 4.5 5 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}

            {nextDay ? (
              <button
                type="button"
                aria-label={`Ir al día siguiente: ${nextDay.dayNumber} de ${MONTH_NAMES[nextDay.monthNumber - 1]}`}
                onClick={() => handleFlip("next")}
                disabled={Boolean(activeAnimation)}
                className="absolute inset-y-0 right-0 z-30 my-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-slate-900/60 text-slate-100 shadow-md shadow-black/30 transition hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-11 lg:right-4"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="h-4 w-4 sm:h-5 sm:w-5"
                  aria-hidden="true"
                >
                  <path
                    d="m7.5 5.5 5 4.5-5 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <span
                className="absolute inset-y-0 right-0 z-30 my-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-slate-900/35 text-slate-300/45 sm:h-11 sm:w-11 lg:right-4"
                aria-hidden="true"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 sm:h-5 sm:w-5">
                  <path
                    d="m7.5 5.5 5 4.5-5 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}

            <div className={styles.sheetStack}>
              <article className={`${styles.sheet} ${styles.baseSheet}`}>
                <DaySheetContent
                  year={year}
                  monthNumber={baseReference.monthNumber}
                  dayNumber={baseReference.dayNumber}
                />
              </article>

              {activeAnimation && flipReference ? (
                <article
                  className={`${styles.sheet} ${styles.flipSheet} ${
                    activeAnimation.direction === "next"
                      ? styles.flipNext
                      : styles.flipPrev
                  }`}
                  onAnimationEnd={handleAnimationEnd}
                >
                  <DaySheetContent
                    year={year}
                    monthNumber={flipReference.monthNumber}
                    dayNumber={flipReference.dayNumber}
                  />
                </article>
              ) : null}
            </div>
          </div>

          <div className="relative z-20 mt-4 flex flex-wrap items-center justify-center gap-2.5 sm:mt-6 sm:gap-3 lg:mt-4">
            <Link
              href={`/mes/${monthNumber}`}
              className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-white/15 sm:px-5 sm:py-2"
            >
              Volver al mes
            </Link>
            <Link
              href="/anual"
              className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-white/15 sm:px-5 sm:py-2"
            >
              Ir al calendario anual
            </Link>
            {canExitClientMode ? (
              <ExitClientModeButton className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-white/15 sm:px-5 sm:py-2 disabled:cursor-not-allowed disabled:opacity-60" />
            ) : null}
          </div>
        </section>

        <EfemeridesDayPanel
          events={eventsOfDay}
          importSources={importSources}
          isLoading={isLoadingEvents}
          style={dayPanelStyle}
          className="relative z-30 mx-auto w-[calc(100%-1rem)] min-h-[16rem] sm:w-full"
        />
      </div>
    </main>
  );
}

