"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

type MonthStatsPanelProps = {
  year: number;
  monthNumber: number;
  defaultOpen?: boolean;
};

function MonthStatsSectionSkeleton() {
  return (
    <div
      className="mt-3 rounded-2xl border border-white/20 bg-black/20 p-4 shadow-xl shadow-black/30 backdrop-blur-sm sm:p-5"
      aria-busy="true"
      aria-label="Cargando datos estadísticos"
    >
      <div className="auth-skeleton h-4 w-44 rounded" />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`panel-skeleton-card-${index}`}
            className="auth-skeleton h-[5rem] rounded-xl"
          />
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="auth-skeleton h-44 rounded-xl" />
        <div className="auth-skeleton h-44 rounded-xl" />
      </div>
    </div>
  );
}

const MonthEventStats = dynamic(() => import("@/components/MonthEventStats"), {
  loading: () => <MonthStatsSectionSkeleton />,
});

export default function MonthStatsPanel({
  year,
  monthNumber,
  defaultOpen = false,
}: MonthStatsPanelProps) {
  const AUTO_SCROLL_TOP_GAP = 16;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(false);

  const scrollPanelToTop = useCallback((behavior: ScrollBehavior) => {
    const panelElement = panelRef.current;
    if (!panelElement) {
      return;
    }

    panelElement.scrollIntoView({
      behavior,
      block: "start",
      inline: "nearest",
    });
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      shouldAutoScrollRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isOpen || !shouldAutoScrollRef.current) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }
      scrollPanelToTop("smooth");
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isOpen, scrollPanelToTop]);

  const handleDataReady = useCallback(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    // Espera al siguiente frame para asegurar layout final luego de renderizar datos.
    window.requestAnimationFrame(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }

      scrollPanelToTop("smooth");

      // Corrección final suave solo si el botón quedó desalineado de forma visible.
      shouldAutoScrollRef.current = false;
    });
  }, [scrollPanelToTop]);

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-white/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.68)_0%,rgba(15,23,42,0.44)_100%)] p-4 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-5 lg:p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-300/18 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -bottom-28 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl"
      />

      <button
        type="button"
        onClick={handleToggle}
        className="relative z-10 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/20 bg-slate-900/45 px-4 py-3 text-left text-sm font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition hover:bg-slate-900/58 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/55 sm:text-base lg:px-4 lg:py-2.5 lg:text-sm"
        aria-expanded={isOpen}
        aria-controls="month-stats-panel"
      >
        <span className="flex min-w-0 items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4 shrink-0 text-sky-300"
            aria-hidden="true"
          >
            <path
              d="M4 18h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M7 16v-4m5 4V8m5 8v-6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M7 9.5l4.5-2.5L16 10"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="min-w-0">
            <span className="block truncate">
              {isOpen ? "Ocultar datos estadisticos" : "Mostrar datos estadisticos"}
            </span>
            <span className="mt-0.5 block text-[11px] font-medium text-slate-300/75 sm:text-xs">
              Resumen de actividad y carga por dia.
            </span>
          </span>
        </span>

        <span
          className={`shrink-0 text-base leading-none text-slate-200/80 transition ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path
              d="M5 7.5l5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      </section>

      {isOpen ? (
        <div
          ref={panelRef}
          id="month-stats-panel"
          className="mt-3"
          style={{ scrollMarginTop: `${AUTO_SCROLL_TOP_GAP}px` }}
        >
          <MonthEventStats
            year={year}
            monthNumber={monthNumber}
            className="shadow-[0_20px_42px_rgba(2,8,23,0.32)]"
            onDataReady={handleDataReady}
          />
        </div>
      ) : null}
    </>
  );
}


