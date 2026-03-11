"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type EfemerideEvent } from "@/lib/efemerides";

type EfemeridesDayPanelProps = {
  events: EfemerideEvent[];
  importSources: string[];
  isLoading: boolean;
  className?: string;
  style?: CSSProperties;
};

type ToastTone = "success" | "error";

type ToastState = {
  message: string;
  tone: ToastTone;
} | null;

type DownloadPreviewState = {
  fileDate: string;
  previewUrl: string;
  blob: Blob;
} | null;

type FilterableEventType = "cumpleanos" | "aniversario" | "dia";

const FILTERABLE_EVENT_TYPES: {
  type: FilterableEventType;
  label: string;
}[] = [
  { type: "cumpleanos", label: "Cumpleaños" },
  { type: "aniversario", label: "Aniversario" },
  { type: "dia", label: "Día" },
];

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function eventTypeLabel(type: EfemerideEvent["type"]) {
  if (type === "cumpleanos") return "\ud83c\udf82";
  if (type === "aniversario") return "\ud83d\udcc5";
  if (type === "dia") return "\ud83d\udcc6";
  if (type === "sin_novedad") return "\ud83d\udcdd";
  return "\ud83d\udcc4";
}

function eventTypeClasses(type: EfemerideEvent["type"]) {
  if (type === "cumpleanos") {
    return "border border-fuchsia-300/35 bg-fuchsia-400/20 text-fuchsia-100";
  }
  if (type === "aniversario") {
    return "border border-sky-300/35 bg-sky-400/20 text-sky-100";
  }
  if (type === "dia") {
    return "border border-amber-200/35 bg-amber-300/20 text-amber-100";
  }
  if (type === "sin_novedad") {
    return "border border-slate-200/30 bg-slate-300/20 text-slate-100";
  }
  return "border border-indigo-200/35 bg-indigo-300/20 text-indigo-100";
}

function eventTypePalette(type: EfemerideEvent["type"]) {
  if (type === "cumpleanos") return { bg: "#5b2b94", text: "#f5eaff" };
  if (type === "aniversario") return { bg: "#075985", text: "#d7f0ff" };
  if (type === "dia") return { bg: "#92400e", text: "#ffedd5" };
  if (type === "sin_novedad") return { bg: "#475569", text: "#e2e8f0" };
  return { bg: "#4338ca", text: "#e0e7ff" };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function wrapLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = words[0] ?? "";

  for (let index = 1; index < words.length; index += 1) {
    const next = words[index] ?? "";
    const candidate = `${current} ${next}`;

    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = next;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function SelectChevron() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-300/70">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="m5.5 7.5 4.5 5 4.5-5" />
      </svg>
    </span>
  );
}

export default function EfemeridesDayPanel({
  events,
  importSources,
  isLoading,
  className = "",
  style,
}: EfemeridesDayPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [eventTypeFilters, setEventTypeFilters] = useState<
    Record<FilterableEventType, boolean>
  >({
    cumpleanos: true,
    aniversario: true,
    dia: true,
  });
  const [selectedAreaFilter, setSelectedAreaFilter] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [isPreviewImageLoading, setIsPreviewImageLoading] = useState(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadPreview, setDownloadPreview] = useState<DownloadPreviewState>(
    null
  );
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const areaOptions = useMemo(() => {
    return Array.from(
      new Set(
        events
          .map((event) => event.areaLabel?.trim() ?? "")
          .filter((label) => label.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "es-AR"));
  }, [events]);
  const filteredEvents = events.filter((event) => {
    const typeMatches =
      event.type === "cumpleanos"
        ? eventTypeFilters.cumpleanos
        : event.type === "aniversario"
          ? eventTypeFilters.aniversario
          : event.type === "dia"
            ? eventTypeFilters.dia
            : true;
    if (!typeMatches) {
      return false;
    }

    if (!selectedAreaFilter) {
      return true;
    }

    return event.areaLabel === selectedAreaFilter;
  });
  const hasVisibleEvents = filteredEvents.length > 0;
  const activeFilterCount = FILTERABLE_EVENT_TYPES.reduce(
    (count, option) => count + (eventTypeFilters[option.type] ? 0 : 1),
    0
  );
  const totalActiveFilters = activeFilterCount + (selectedAreaFilter ? 1 : 0);

  const handleOpenGreeting = (event: EfemerideEvent) => {
    const fromPath = pathname || "/";
    const params = new URLSearchParams({
      from: fromPath,
    });
    const targetId = event.birthdayId || "__evento__";

    if (!event.birthdayId) {
      params.set("eventTitle", event.title);
      params.set("eventDay", String(event.day));
      params.set("eventMonth", String(event.month));
      params.set("eventYear", String(event.year));
    }

    router.push(`/salutacion/${encodeURIComponent(targetId)}?${params.toString()}`);
  };

  const showToast = (message: string, tone: ToastTone) => {
    setToast({ message, tone });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2800);
  };

  const clearPreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const closeDownloadPreview = () => {
    clearPreviewUrl();
    setDownloadPreview(null);
    setIsPreviewImageLoading(false);
  };

  const toggleEventTypeFilter = (type: FilterableEventType) => {
    setEventTypeFilters((previous) => ({
      ...previous,
      [type]: !previous[type],
    }));
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isFilterMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (filterMenuRef.current?.contains(target)) {
        return;
      }

      setIsFilterMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isFilterMenuOpen]);

  useEffect(() => {
    if (!selectedAreaFilter) {
      return;
    }

    if (!areaOptions.includes(selectedAreaFilter)) {
      setSelectedAreaFilter("");
    }
  }, [areaOptions, selectedAreaFilter]);

  const buildEventsImageBlob = async () => {
    const firstEvent = filteredEvents[0] ?? events[0];
    const pathnameDateMatch = pathname?.match(/\/mes\/(\d+)\/dia\/(\d+)/);
    const fileDate =
      firstEvent &&
      Number.isInteger(firstEvent.year) &&
      Number.isInteger(firstEvent.month) &&
      Number.isInteger(firstEvent.day)
        ? `${String(firstEvent.year)}-${String(firstEvent.month).padStart(2, "0")}-${String(firstEvent.day).padStart(2, "0")}`
        : pathnameDateMatch
          ? `mes-${String(pathnameDateMatch[1] ?? "").padStart(2, "0")}-dia-${String(pathnameDateMatch[2] ?? "").padStart(2, "0")}`
        : "sin-fecha";
    const footerText =
      importSources.length > 0
        ? `${importSources.length > 1 ? "Fuentes importadas" : "Fuente importada"}: ${importSources.join(" + ")}`
        : "";

    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");
    if (!measureContext) {
      throw new Error("No se pudo crear el contexto de medición.");
    }

    const outputWidth = 900;
    const outerPadding = 28;
    const panelPadding = 24;
    const contentWidth = outputWidth - outerPadding * 2 - panelPadding * 2;
    const headerHeight = 24;
    const listTopGap = 14;
    const cardGap = 12;
    const cardPaddingX = 16;
    const cardPaddingY = 14;
    const badgeSize = 28;
    const cardIconGap = 10;
    const titleLineHeight = 24;
    const footerTopGap = 14;
    const footerLineHeight = 17;

    measureContext.font = '400 18px "Segoe UI", Arial, sans-serif';
    const eventLayouts = hasVisibleEvents
      ? filteredEvents.map((event) => {
          const badgeText = eventTypeLabel(event.type);

          measureContext.font = '400 18px "Segoe UI", Arial, sans-serif';
          const lines = wrapLines(
            measureContext,
            event.title,
            contentWidth - cardPaddingX * 2 - badgeSize - cardIconGap
          );
          const textHeight = lines.length * titleLineHeight;
          const rowHeight = Math.max(badgeSize, textHeight);
          const cardHeight = cardPaddingY * 2 + rowHeight;

          return {
            event,
            badgeText,
            lines,
            rowHeight,
            cardHeight,
          };
        })
      : [];
    measureContext.font = '400 14px "Segoe UI", Arial, sans-serif';
    const footerLines = footerText
      ? wrapLines(measureContext, footerText, contentWidth)
      : [];

    let panelContentHeight = headerHeight + listTopGap;
    if (hasVisibleEvents) {
      panelContentHeight +=
        eventLayouts.reduce((total, layout) => total + layout.cardHeight, 0) +
        Math.max(0, eventLayouts.length - 1) * cardGap;
    } else {
      panelContentHeight += 24;
    }
    if (footerLines.length > 0) {
      panelContentHeight += footerTopGap + footerLines.length * footerLineHeight;
    }
    const panelHeight = panelPadding * 2 + panelContentHeight;
    const outputHeight = panelHeight + outerPadding * 2;

    const exportScale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth * exportScale;
    canvas.height = outputHeight * exportScale;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("No se pudo crear el contexto de imagen.");
    }

    context.scale(exportScale, exportScale);
    context.fillStyle = "#071427";
    context.fillRect(0, 0, outputWidth, outputHeight);

    const panelX = outerPadding;
    const panelY = outerPadding;
    const panelWidth = outputWidth - outerPadding * 2;

    context.shadowColor = "rgba(2, 8, 23, 0.5)";
    context.shadowBlur = 24;
    context.shadowOffsetY = 8;
    roundedRect(context, panelX, panelY, panelWidth, panelHeight, 28);
    context.fillStyle = "rgba(15, 23, 42, 0.9)";
    context.fill();
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    roundedRect(context, panelX, panelY, panelWidth, panelHeight, 28);
    context.strokeStyle = "rgba(148, 163, 184, 0.38)";
    context.lineWidth = 1;
    context.stroke();

    const contentX = panelX + panelPadding;
    let cursorY = panelY + panelPadding;

    context.fillStyle = "#e2ecff";
    context.font = '700 20px "Segoe UI", Arial, sans-serif';
    context.textBaseline = "top";
    context.fillText("EVENTOS DEL DÍA", contentX, cursorY);
    cursorY += headerHeight + listTopGap;

    if (hasVisibleEvents) {
      for (const layout of eventLayouts) {
        roundedRect(
          context,
          contentX,
          cursorY,
          contentWidth,
          layout.cardHeight,
          16
        );
        context.fillStyle = "rgba(255, 255, 255, 0.08)";
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, 0.18)";
        context.lineWidth = 1;
        context.stroke();

        const rowX = contentX + cardPaddingX;
        const rowY = cursorY + cardPaddingY;
        const textHeight = layout.lines.length * titleLineHeight;
        const badgeX = rowX;
        const badgeY = rowY + (layout.rowHeight - badgeSize) / 2;
        const palette = eventTypePalette(layout.event.type);
        roundedRect(context, badgeX, badgeY, badgeSize, badgeSize, 999);
        context.fillStyle = palette.bg;
        context.fill();

        context.fillStyle = palette.text;
        context.font = '700 13px "Segoe UI Emoji", "Segoe UI", Arial, sans-serif';
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          layout.badgeText,
          badgeX + badgeSize / 2,
          badgeY + badgeSize / 2
        );

        context.textAlign = "left";
        context.textBaseline = "top";
        context.fillStyle = "rgba(226, 232, 240, 0.95)";
        context.font = '400 18px "Segoe UI", Arial, sans-serif';
        const titleStartX = badgeX + badgeSize + cardIconGap;
        const titleStartY = rowY + (layout.rowHeight - textHeight) / 2;
        layout.lines.forEach((line, index) => {
          context.fillText(
            line,
            titleStartX,
            titleStartY + index * titleLineHeight
          );
        });

        cursorY += layout.cardHeight + cardGap;
      }
      cursorY -= cardGap;
    } else {
      context.fillStyle = "rgba(203, 213, 225, 0.9)";
      context.font = '400 18px "Segoe UI", Arial, sans-serif';
      context.textBaseline = "top";
      context.fillText("No hay eventos cargados para esta fecha.", contentX, cursorY);
      cursorY += 24;
    }

    if (footerLines.length > 0) {
      cursorY += footerTopGap;
      context.fillStyle = "rgba(203, 213, 225, 0.75)";
      context.font = '400 14px "Segoe UI", Arial, sans-serif';
      context.textBaseline = "top";
      footerLines.forEach((line, index) => {
        context.fillText(line, contentX, cursorY + index * footerLineHeight);
      });
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error("No se pudo crear el archivo PNG."));
      }, "image/png");
    });

    return { blob, fileDate };
  };

  const handleOpenDownloadPreview = async () => {
    if (isLoading || isPreparingPreview || isDownloadingImage) {
      return;
    }

    setIsFilterMenuOpen(false);
    setIsPreparingPreview(true);
    setIsPreviewImageLoading(true);
    try {
      const generated = await buildEventsImageBlob();
      const previewUrl = URL.createObjectURL(generated.blob);
      clearPreviewUrl();
      previewUrlRef.current = previewUrl;
      setDownloadPreview({
        fileDate: generated.fileDate,
        previewUrl,
        blob: generated.blob,
      });
    } catch {
      setIsPreviewImageLoading(false);
      showToast("No se pudo generar la vista previa de descarga.", "error");
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleConfirmDownload = async () => {
    if (!downloadPreview) {
      return;
    }

    setIsDownloadingImage(true);
    setDownloadProgress(6);
    try {
      const progressSteps = [18, 34, 49, 63, 77, 88, 95];
      for (const step of progressSteps) {
        setDownloadProgress(step);
        await wait(70);
      }

      const url = URL.createObjectURL(downloadPreview.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `eventos-del-dia-${downloadPreview.fileDate}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);
      setDownloadProgress(100);
      await wait(220);

      closeDownloadPreview();
      showToast("La descarga se llevó a cabo con éxito.", "success");
    } catch {
      setDownloadProgress(0);
      showToast("No se pudo completar la descarga.", "error");
    } finally {
      setIsDownloadingImage(false);
      setDownloadProgress(0);
    }
  };
  const isPreviewModalOpen = isPreparingPreview || downloadPreview !== null;

  return (
    <>
      <aside
        className={`relative z-20 w-full overflow-visible rounded-[1.75rem] border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-4 shadow-[0_22px_42px_rgba(2,8,23,0.4)] backdrop-blur-md sm:p-5 lg:flex lg:min-h-0 lg:max-h-[var(--day-panel-max-height)] lg:flex-col ${className}`}
        style={style}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-sky-300/18 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -bottom-24 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl"
        />

        <div className="relative z-40 flex items-center justify-between gap-3">
          <h3 className="shrink-0 pl-1 text-sm font-bold uppercase tracking-[0.08em] text-slate-100">
            Eventos del día
          </h3>
          <div className="relative z-50 flex items-center gap-2" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsFilterMenuOpen((previous) => !previous);
              }}
              aria-expanded={isFilterMenuOpen}
              aria-haspopup="dialog"
              aria-label="Filtrar por tipo de evento"
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                totalActiveFilters > 0
                  ? "border-sky-300/35 bg-sky-300/15 text-sky-100 hover:bg-sky-300/20"
                  : "border-white/20 bg-white/10 text-slate-100 hover:bg-white/15"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M3 5.5h4.5" />
                <circle cx="9.2" cy="5.5" r="1.6" />
                <path d="M10.8 5.5H17" />
                <path d="M3 10h8" />
                <circle cx="13.2" cy="10" r="1.6" />
                <path d="M14.8 10H17" />
                <path d="M3 14.5h2.5" />
                <circle cx="7.8" cy="14.5" r="1.6" />
                <path d="M9.4 14.5H17" />
              </svg>
              {totalActiveFilters > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-300 px-1 text-xs text-slate-950">
                  {totalActiveFilters}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleOpenDownloadPreview();
              }}
              disabled={isLoading || isPreparingPreview || isDownloadingImage}
              aria-label="Generar vista previa para descargar el listado de eventos"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-slate-100 shadow-sm shadow-black/20 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isPreparingPreview ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/45 border-t-white" />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M12 3v11" />
                  <path d="m7 11 5 5 5-5" />
                  <path d="M4 20h16" />
                </svg>
              )}
            </button>

            {isFilterMenuOpen ? (
              <div
                role="dialog"
                aria-label="Filtros de búsqueda"
                className="absolute right-0 top-[calc(100%+0.35rem)] z-[120] w-[min(92vw,22rem)] rounded-xl border border-white/20 bg-slate-950/90 p-3 shadow-2xl shadow-black/45 backdrop-blur-md"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300/85">
                  Filtrar tipos
                </p>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                  Área de personal
                  <div className="relative mt-1">
                    <select
                      value={selectedAreaFilter}
                      onChange={(event) => {
                        setSelectedAreaFilter(event.target.value);
                      }}
                      disabled={areaOptions.length === 0}
                      className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/85 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/60 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                    >
                      <option value="">Todas</option>
                      {areaOptions.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </label>
                <div className="mt-2 space-y-1.5">
                  {FILTERABLE_EVENT_TYPES.map((option) => (
                    <label
                      key={option.type}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/10"
                    >
                      <input
                        type="checkbox"
                        checked={eventTypeFilters[option.type]}
                        onChange={() => {
                          toggleEventTypeFilter(option.type);
                        }}
                        className="h-4 w-4 rounded border-white/25 bg-slate-950/30 text-sky-300 focus:ring-sky-300/35"
                      />
                      <span className="text-sm text-slate-200">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <ul className="relative z-10 mt-3 space-y-2 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {Array.from({ length: 4 }).map((_, index) => (
              <li
                key={`skeleton-${index}`}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur-sm"
              >
                <div className="auth-skeleton h-5 w-24 rounded-full" />
                <div className="auth-skeleton mt-2 h-4 w-full rounded" />
                <div className="auth-skeleton mt-2 h-4 w-4/5 rounded" />
              </li>
            ))}
          </ul>
        ) : hasVisibleEvents ? (
          <ul className="relative z-10 mt-3 space-y-2.5 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {filteredEvents.map((event) => (
              <li
                key={event.id}
                className="relative rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm"
              >
                {event.type === "cumpleanos" ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenGreeting(event);
                    }}
                    aria-label="Generar tarjeta de salutación"
                    className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-900/55 text-slate-100 shadow-sm shadow-black/25 transition hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/45"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
                      <path d="M14 3v5h4" />
                      <path d="M10 12h6" />
                      <path d="M10 15h6" />
                    </svg>
                  </button>
                ) : null}
                <div
                  className={`mt-1 flex items-start gap-2 ${
                    event.type === "cumpleanos" ? "pr-10" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${eventTypeClasses(
                      event.type
                    )}`}
                  >
                    {eventTypeLabel(event.type)}
                  </span>
                  <p className="min-w-0 text-sm leading-6 text-slate-100/90">
                    {event.title}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="relative z-10 mt-2 text-sm text-slate-300/90 lg:flex-1">
            {events.length > 0
              ? "No hay eventos para los filtros seleccionados."
              : "No hay eventos cargados para esta fecha."}
          </p>
        )}

        {!isLoading && importSources.length > 0 ? (
        <p className="relative z-10 mt-3 shrink-0 text-[11px] text-slate-300/75">
            {importSources.length > 1 ? "Fuentes importadas: " : "Fuente importada: "}
            {importSources.join(" + ")}
          </p>
        ) : null}
      </aside>

      {isPreviewModalOpen ? (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-white/20 bg-[linear-gradient(140deg,rgba(15,23,42,0.86)_0%,rgba(15,23,42,0.74)_100%)] p-5 text-slate-100 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-md">
            <h3 className="text-lg font-bold text-slate-100">Vista previa de descarga</h3>
            <p className="mt-2 text-sm text-slate-300/85">
              Se va a descargar una imagen PNG con el listado de eventos del día tal
              como aparece en el panel.
            </p>

            {isPreparingPreview || !downloadPreview ? (
              <div className="mt-4 rounded-xl border border-white/20 bg-slate-900/35 p-4 backdrop-blur-sm">
                <div className="auth-skeleton h-7 w-52 rounded-full" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`preview-skeleton-${index}`}
                      className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm"
                    >
                      <div className="auth-skeleton h-5 w-20 rounded-full" />
                      <div className="auth-skeleton mt-3 h-4 w-full rounded" />
                      <div className="auth-skeleton mt-2 h-4 w-4/5 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="relative mt-4 overflow-hidden rounded-xl border border-white/20 bg-slate-900/35 backdrop-blur-sm">
                {isPreviewImageLoading ? (
                  <div className="absolute inset-0 z-10 p-4">
                    <div className="auth-skeleton h-7 w-52 rounded-full" />
                    <div className="mt-4 space-y-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={`image-skeleton-${index}`}
                          className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm"
                        >
                          <div className="auth-skeleton h-5 w-20 rounded-full" />
                          <div className="auth-skeleton mt-3 h-4 w-full rounded" />
                          <div className="auth-skeleton mt-2 h-4 w-4/5 rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Image
                  src={downloadPreview.previewUrl}
                  alt="Vista previa del listado de eventos del día"
                  width={900}
                  height={1400}
                  unoptimized
                  onLoad={() => {
                    setIsPreviewImageLoading(false);
                  }}
                  onError={() => {
                    setIsPreviewImageLoading(false);
                    showToast("No se pudo cargar la vista previa.", "error");
                  }}
                  className={`h-auto w-full object-contain transition-opacity duration-200 ${
                    isPreviewImageLoading ? "opacity-0" : "opacity-100"
                  }`}
                />
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDownloadPreview}
                disabled={isDownloadingImage || isPreparingPreview}
                className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleConfirmDownload();
                }}
                disabled={isDownloadingImage || isPreparingPreview || !downloadPreview}
                className="relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDownloadingImage ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-slate-100/35 transition-[width] duration-150 ease-out"
                    style={{ width: `${downloadProgress}%` }}
                  />
                ) : null}
                <span className="relative z-10 inline-flex items-center gap-2">
                  {isPreparingPreview ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/35 border-t-slate-950" />
                      Generando...
                    </>
                  ) : isDownloadingImage ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/35 border-t-slate-950" />
                      Descargando...
                    </>
                  ) : (
                    "Descargar"
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[220] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2">
          <p
            role="status"
            aria-live="polite"
            className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur ${
              toast.tone === "success"
                ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                : "border-red-300/30 bg-red-400/15 text-red-100"
            }`}
            style={{ animation: "toast-slide-down 320ms ease-out" }}
          >
            {toast.message}
          </p>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes toast-slide-down {
          from {
            opacity: 0;
            transform: translateY(-18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
