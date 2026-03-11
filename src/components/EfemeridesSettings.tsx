"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  EFEMERIDES_BROADCAST_EVENT,
  type EfemeridesStoredPayload,
} from "@/lib/efemerides";
import { MONTH_NAMES } from "@/lib/calendar";

type EfemeridesSettingsProps = {
  fallbackMonth: number;
  fallbackYear: number;
};

type CurrentResponse = {
  data: EfemeridesStoredPayload | null;
};

type ApiErrorResponse = {
  error: string;
};

type IncomingImportSummary = Pick<
  EfemeridesStoredPayload,
  "sourceName" | "month" | "year" | "eventCount"
>;

type ConflictResponse = ApiErrorResponse & {
  conflict: EfemeridesStoredPayload;
  incoming: IncomingImportSummary;
};

class UploadConflictError extends Error {
  conflict: EfemeridesStoredPayload;
  incoming: IncomingImportSummary;

  constructor(
    message: string,
    conflict: EfemeridesStoredPayload,
    incoming: IncomingImportSummary
  ) {
    super(message);
    this.name = "UploadConflictError";
    this.conflict = conflict;
    this.incoming = incoming;
  }
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function isStoredPayload(value: unknown): value is EfemeridesStoredPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sourceName?: unknown }).sourceName === "string" &&
    typeof (value as { month?: unknown }).month === "number" &&
    typeof (value as { year?: unknown }).year === "number" &&
    typeof (value as { importedAt?: unknown }).importedAt === "string" &&
    typeof (value as { eventCount?: unknown }).eventCount === "number" &&
    Array.isArray((value as { events?: unknown }).events)
  );
}

function isIncomingImportSummary(value: unknown): value is IncomingImportSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sourceName?: unknown }).sourceName === "string" &&
    typeof (value as { month?: unknown }).month === "number" &&
    typeof (value as { year?: unknown }).year === "number" &&
    typeof (value as { eventCount?: unknown }).eventCount === "number"
  );
}

function isConflictResponse(value: unknown): value is ConflictResponse {
  return (
    isApiError(value) &&
    typeof value === "object" &&
    value !== null &&
    "conflict" in value &&
    isStoredPayload((value as { conflict: unknown }).conflict) &&
    "incoming" in value &&
    isIncomingImportSummary((value as { incoming: unknown }).incoming)
  );
}

function parseXhrResponse(xhr: XMLHttpRequest): unknown {
  if (xhr.response && typeof xhr.response === "object") {
    return xhr.response;
  }

  try {
    return JSON.parse(xhr.responseText);
  } catch {
    return null;
  }
}

function uploadPdfWithProgress(
  file: File,
  fallbackMonth: number,
  fallbackYear: number,
  replaceExisting: boolean,
  onProgress: (progress: number) => void
) {
  return new Promise<EfemeridesStoredPayload>((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fallbackMonth", String(fallbackMonth));
    formData.append("fallbackYear", String(fallbackYear));
    formData.append("replaceExisting", replaceExisting ? "1" : "0");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/efemerides/parse");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percent = Math.round((event.loaded / event.total) * 90);
      onProgress(Math.max(8, Math.min(90, percent)));
    };

    xhr.onload = () => {
      const body = parseXhrResponse(xhr);

      if (xhr.status === 409 && isConflictResponse(body)) {
        reject(new UploadConflictError(body.error, body.conflict, body.incoming));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            isApiError(body) ? body.error : "No se pudo procesar el PDF."
          )
        );
        return;
      }

      if (!isStoredPayload(body)) {
        reject(new Error("La respuesta del servidor no es válida."));
        return;
      }

      resolve(body);
    };

    xhr.onerror = () => {
      reject(new Error("No se pudo subir el archivo."));
    };

    xhr.onabort = () => {
      reject(new Error("La carga fue cancelada."));
    };

    onProgress(8);
    xhr.send(formData);
  });
}

function formatImportDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return date.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SettingsPanelSkeleton() {
  return (
    <div aria-hidden="true" className="mt-5 space-y-4">
      <div className="rounded-2xl border border-white/15 bg-white/8 p-6">
        <div className="auth-skeleton h-4 w-48 rounded" />
        <div className="auth-skeleton mt-3 h-10 w-44 rounded-full" />
      </div>

      <div className="rounded-xl border border-white/15 bg-white/8 p-4">
        <div className="auth-skeleton h-3 w-24 rounded" />
        <div className="mt-3 flex items-start gap-3">
          <span className="auth-skeleton h-10 w-10 rounded-lg" />
          <div className="w-full space-y-2">
            <div className="auth-skeleton h-4 w-4/5 rounded" />
            <div className="auth-skeleton h-3 w-2/5 rounded" />
            <div className="auth-skeleton h-3 w-3/5 rounded" />
          </div>
        </div>
      </div>

      <div className="auth-skeleton h-10 w-36 rounded-full" />
    </div>
  );
}

export default function EfemeridesSettings({
  fallbackMonth,
  fallbackYear,
}: EfemeridesSettingsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const processingTimerRef = useRef<number | null>(null);

  const monthQuery = useMemo(() => {
    const params = new URLSearchParams({
      month: String(fallbackMonth),
      year: String(fallbackYear),
    });
    return params.toString();
  }, [fallbackMonth, fallbackYear]);

  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentImport, setCurrentImport] = useState<EfemeridesStoredPayload | null>(
    null
  );
  const [pendingConflict, setPendingConflict] = useState<EfemeridesStoredPayload | null>(
    null
  );
  const [pendingIncoming, setPendingIncoming] = useState<IncomingImportSummary | null>(
    null
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const [isLoadingCurrentImport, setIsLoadingCurrentImport] = useState(false);

  const readCurrentImport = useCallback(async () => {
    const response = await fetch(`/api/efemerides/current?${monthQuery}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as CurrentResponse | ApiErrorResponse;

    if (!response.ok || "error" in data) {
      throw new Error(
        "error" in data ? data.error : "No se pudo consultar el estado actual."
      );
    }
    return data.data;
  }, [monthQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;
    setIsLoadingCurrentImport(true);

    async function loadCurrentState() {
      try {
        const current = await readCurrentImport();
        if (!isMounted) {
          return;
        }
        setCurrentImport(current);
      } catch {
        if (!isMounted) {
          return;
        }

        setCurrentImport(null);
      } finally {
        if (!isMounted) {
          return;
        }

        setIsLoadingCurrentImport(false);
      }
    }

    void loadCurrentState();

    return () => {
      isMounted = false;
    };
  }, [isOpen, readCurrentImport]);

  useEffect(() => {
    if (!isParsing) {
      if (processingTimerRef.current !== null) {
        window.clearInterval(processingTimerRef.current);
        processingTimerRef.current = null;
      }
      return;
    }

    processingTimerRef.current = window.setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 98) {
          return prev;
        }
        return prev + 1;
      });
    }, 220);

    return () => {
      if (processingTimerRef.current !== null) {
        window.clearInterval(processingTimerRef.current);
        processingTimerRef.current = null;
      }
    };
  }, [isParsing]);

  async function processFile(
    file: File,
    options?: {
      replaceExisting?: boolean;
    }
  ) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("El archivo debe tener formato PDF.");
      setMessage(null);
      return;
    }

    const replaceExisting = options?.replaceExisting === true;

    setIsParsing(true);
    setUploadProgress(0);
    setError(null);
    setMessage(null);
    setPendingConflict(null);
    setPendingIncoming(null);
    setIsReplaceConfirmOpen(false);

    try {
      const data = await uploadPdfWithProgress(
        file,
        fallbackMonth,
        fallbackYear,
        replaceExisting,
        setUploadProgress
      );

      setUploadProgress(100);
      window.dispatchEvent(new Event(EFEMERIDES_BROADCAST_EVENT));

      // La tarjeta representa el archivo del mes en pantalla.
      try {
        const current = await readCurrentImport();
        setCurrentImport(current);
      } catch {
        setCurrentImport(
          data.month === fallbackMonth && data.year === fallbackYear ? data : null
        );
      }

      setPendingFile(null);
      setPendingConflict(null);
      setPendingIncoming(null);
      setIsReplaceConfirmOpen(false);
      setMessage(
        `Se importaron ${data.eventCount} eventos para ${MONTH_NAMES[data.month - 1]} ${data.year}.`
      );
      setError(null);
    } catch (caught) {
      if (caught instanceof UploadConflictError) {
        setPendingConflict(caught.conflict);
        setPendingIncoming(caught.incoming);
        setPendingFile(file);
        setIsReplaceConfirmOpen(false);
        setError(caught.message);
      } else {
        const detail =
          caught instanceof Error ? caught.message : "Error al importar PDF.";
        setError(detail);
      }

      setMessage(null);
      setUploadProgress(0);
    } finally {
      setIsParsing(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    event.currentTarget.value = "";
  }

  async function clearImportedData() {
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/efemerides/current?${monthQuery}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as
        | { ok: boolean; removed?: boolean }
        | ApiErrorResponse;

      if (!response.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : "No se pudo eliminar la carga actual."
        );
      }

      window.dispatchEvent(new Event(EFEMERIDES_BROADCAST_EVENT));
      setCurrentImport(null);
      setPendingConflict(null);
      setPendingIncoming(null);
      setPendingFile(null);
      setIsReplaceConfirmOpen(false);
      setUploadProgress(0);
      setMessage("Se eliminó la carga actual de efemérides para este mes.");
    } catch (caught) {
      const detail =
        caught instanceof Error ? caught.message : "Error al eliminar la carga.";
      setError(detail);
      setMessage(null);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Configurar efemérides"
        onClick={() => setIsOpen(true)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-slate-100/90 shadow-sm transition duration-300 ease-out hover:bg-white/15 ${
          isOpen ? "rotate-90" : "rotate-0"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M12 3.75a1.5 1.5 0 0 1 1.5 1.5v.74a6.75 6.75 0 0 1 1.92.8l.53-.53a1.5 1.5 0 1 1 2.12 2.12l-.53.53c.34.6.6 1.24.8 1.92h.74a1.5 1.5 0 1 1 0 3h-.74a6.75 6.75 0 0 1-.8 1.92l.53.53a1.5 1.5 0 1 1-2.12 2.12l-.53-.53a6.75 6.75 0 0 1-1.92.8v.74a1.5 1.5 0 1 1-3 0v-.74a6.75 6.75 0 0 1-1.92-.8l-.53.53a1.5 1.5 0 1 1-2.12-2.12l.53-.53a6.75 6.75 0 0 1-.8-1.92h-.74a1.5 1.5 0 1 1 0-3h.74a6.75 6.75 0 0 1 .8-1.92l-.53-.53a1.5 1.5 0 1 1 2.12-2.12l.53.53c.6-.34 1.24-.6 1.92-.8v-.74a1.5 1.5 0 0 1 1.5-1.5Z" />
          <circle cx="12" cy="12" r="2.9" />
        </svg>
      </button>

      {isOpen ? createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/20 bg-[linear-gradient(145deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.78)_100%)] p-6 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  Cargar efemérides
                </h2>
                <p className="mt-1 text-sm text-slate-300/80">
                  Arrastrá el PDF mensual o selecciónalo desde tu equipo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-slate-200/85 hover:bg-white/10"
              >
                X
              </button>
            </div>

            {isLoadingCurrentImport ? (
              <SettingsPanelSkeleton />
            ) : (
              <>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`mt-5 rounded-2xl border-2 border-dashed p-6 text-center transition ${
                isDragging
                  ? "border-sky-300/55 bg-sky-400/15"
                  : "border-white/20 bg-white/6"
              }`}
            >
              <p className="text-sm text-slate-200/90">
                Soltá el PDF acá o usá el botón para cargarlo.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isParsing}
                className="mt-4 inline-flex rounded-full border border-sky-300/35 bg-sky-400/25 px-5 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/35 disabled:opacity-60"
              >
                {isParsing ? "Procesando..." : "Seleccionar PDF"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={onPickFile}
                className="hidden"
              />
            </div>

            {(isParsing || uploadProgress > 0) && (
              <div className="mt-4 rounded-xl border border-sky-300/30 bg-sky-400/12 px-4 py-3">
                <div className="flex items-center justify-between text-xs font-semibold text-sky-100/95">
                  <span>
                    {isParsing
                      ? "Cargando y procesando el PDF..."
                      : "Carga finalizada"}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-sky-300 transition-all duration-200 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {pendingConflict ? (
              <div className="mt-4 rounded-xl border border-amber-300/35 bg-amber-400/15 px-4 py-3 text-sm text-amber-100">
                <p className="font-semibold">Ya hay un PDF cargado para ese mes.</p>
                <p className="mt-1 text-xs text-amber-100/80">
                  Actual: {pendingConflict.sourceName} ({MONTH_NAMES[pendingConflict.month - 1]}{" "}
                  {pendingConflict.year})
                </p>
                {pendingIncoming ? (
                  <p className="mt-1 text-xs text-amber-100/80">
                    Nuevo: {pendingIncoming.sourceName} (
                    {MONTH_NAMES[pendingIncoming.month - 1]} {pendingIncoming.year}) -{" "}
                    {pendingIncoming.eventCount} eventos
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!pendingFile || isParsing}
                    onClick={() => {
                      setIsReplaceConfirmOpen(true);
                    }}
                    className="inline-flex rounded-full border border-amber-300/40 bg-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reemplazar PDF del mes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingConflict(null);
                      setPendingIncoming(null);
                      setPendingFile(null);
                      setIsReplaceConfirmOpen(false);
                      setError(null);
                    }}
                    className="inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100/90 hover:bg-white/15"
                  >
                    Cancelar
                  </button>
                </div>
                {isReplaceConfirmOpen ? (
                  <div className="mt-3 rounded-lg border border-amber-300/35 bg-amber-400/12 px-3 py-3 text-xs text-amber-100">
                    <p className="font-semibold">Confirmar reemplazo</p>
                    <p className="mt-1">
                      Se va a sobrescribir el PDF actual de ese mes con el nuevo
                      archivo. Esta acción no se puede deshacer desde esta
                      pantalla.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!pendingFile || isParsing}
                        onClick={() => {
                          if (!pendingFile) return;
                          void processFile(pendingFile, { replaceExisting: true });
                        }}
                        className="inline-flex rounded-full border border-rose-300/40 bg-rose-400/22 px-4 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-400/32 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Si, reemplazar
                      </button>
                      <button
                        type="button"
                        disabled={isParsing}
                        onClick={() => {
                          setIsReplaceConfirmOpen(false);
                        }}
                        className="inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100/90 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Volver
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentImport ? (
              <div className="mt-4 rounded-xl border border-white/15 bg-white/8 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-300/75">
                  Archivo cargado
                </p>
                <div className="mt-3 flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/20 text-emerald-200">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d="M8.25 3.75h6l4.5 4.5v10.5A1.5 1.5 0 0 1 17.25 20.25h-9a1.5 1.5 0 0 1-1.5-1.5v-13.5a1.5 1.5 0 0 1 1.5-1.5Z" />
                      <path d="M14.25 3.75v4.5h4.5" />
                      <path d="M9.75 12.75h4.5M9.75 15.75h4.5" />
                    </svg>
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {currentImport.sourceName}
                    </p>
                    <p className="mt-1 text-xs text-slate-300/80">
                      {MONTH_NAMES[currentImport.month - 1]} {currentImport.year}
                    </p>
                    <p className="mt-1 text-xs text-slate-300/80">
                      {currentImport.eventCount} eventos importados
                    </p>
                    <p className="mt-1 text-xs text-slate-400/70">
                      Cargado: {formatImportDate(currentImport.importedAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      void clearImportedData();
                    }}
                    className="inline-flex rounded-full border border-rose-300/35 bg-rose-400/20 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-400/28"
                  >
                    Eliminar efemérides cargadas
                  </button>
                  <p className="mt-2 text-xs text-slate-300/70">
                    Solo se permite un PDF por mes. Podés reemplazarlo subiendo otro.
                  </p>
                </div>
              </div>
            ) : null}

            {message ? (
              <p className="mt-4 rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100">
                {message}
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-xl border border-rose-300/35 bg-rose-400/15 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            ) : null}
              </>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

