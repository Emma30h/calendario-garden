"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import UserNavbar from "@/components/UserNavbar";

type EmailRecipient = {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

type RunStatus = "running" | "success" | "partial" | "error";
type DeliveryStatus = "sent" | "error";

type NotificationDeliveryHistory = {
  id: string;
  runId: string;
  recipientEmail: string;
  status: DeliveryStatus;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
  createdAt: string;
};

type NotificationRunHistory = {
  id: string;
  runDate: string;
  runTimezone: string;
  status: RunStatus;
  totalRecipients: number;
  sentCount: number;
  errorCount: number;
  totalEvents: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  createdAt: string;
  deliveries: NotificationDeliveryHistory[];
};

type ApiErrorResponse = {
  error: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeCronSecretInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const rawSecret = trimmed.toLowerCase().startsWith("cron_secret=")
    ? trimmed.slice(trimmed.indexOf("=") + 1).trim()
    : trimmed;

  if (
    (rawSecret.startsWith('"') && rawSecret.endsWith('"')) ||
    (rawSecret.startsWith("'") && rawSecret.endsWith("'"))
  ) {
    return rawSecret.slice(1, -1).trim();
  }

  return rawSecret;
}

function normalizeRecipient(row: unknown): EmailRecipient | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const email = asNonEmptyString(parsed.email);
  const createdAt = asNonEmptyString(parsed.createdAt);
  const isActive = parsed.isActive;

  if (!id || !email || !createdAt || typeof isActive !== "boolean") {
    return null;
  }

  return {
    id,
    email,
    isActive,
    createdAt,
  };
}

function normalizeRunStatus(value: unknown): RunStatus | null {
  if (
    value === "running" ||
    value === "success" ||
    value === "partial" ||
    value === "error"
  ) {
    return value;
  }

  return null;
}

function normalizeDeliveryStatus(value: unknown): DeliveryStatus | null {
  if (value === "sent" || value === "error") {
    return value;
  }

  return null;
}

function normalizeDeliveryHistory(
  row: unknown
): NotificationDeliveryHistory | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const runId = asNonEmptyString(parsed.runId);
  const recipientEmail = asNonEmptyString(parsed.recipientEmail);
  const status = normalizeDeliveryStatus(parsed.status);
  const provider = asNonEmptyString(parsed.provider) ?? "brevo";
  const providerMessageId = asNonEmptyString(parsed.providerMessageId);
  const errorMessage = asNonEmptyString(parsed.errorMessage);
  const createdAt = asNonEmptyString(parsed.createdAt);

  if (!id || !runId || !recipientEmail || !status || !createdAt) {
    return null;
  }

  return {
    id,
    runId,
    recipientEmail,
    status,
    provider,
    providerMessageId: providerMessageId ?? undefined,
    errorMessage: errorMessage ?? undefined,
    createdAt,
  };
}

function normalizeRunHistory(row: unknown): NotificationRunHistory | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const runDate = asNonEmptyString(parsed.runDate);
  const runTimezone = asNonEmptyString(parsed.runTimezone);
  const status = normalizeRunStatus(parsed.status);
  const totalRecipients = asNonNegativeInteger(parsed.totalRecipients);
  const sentCount = asNonNegativeInteger(parsed.sentCount);
  const errorCount = asNonNegativeInteger(parsed.errorCount);
  const totalEvents = asNonNegativeInteger(parsed.totalEvents);
  const startedAt = asNonEmptyString(parsed.startedAt);
  const completedAt = asNonEmptyString(parsed.completedAt);
  const errorMessage = asNonEmptyString(parsed.errorMessage);
  const createdAt = asNonEmptyString(parsed.createdAt);
  const deliveriesRaw = Array.isArray(parsed.deliveries) ? parsed.deliveries : [];
  const deliveries = deliveriesRaw
    .map((delivery) => normalizeDeliveryHistory(delivery))
    .filter(
      (delivery): delivery is NotificationDeliveryHistory => delivery !== null
    );

  if (
    !id ||
    !runDate ||
    !runTimezone ||
    !status ||
    totalRecipients === null ||
    sentCount === null ||
    errorCount === null ||
    totalEvents === null ||
    !startedAt ||
    !createdAt
  ) {
    return null;
  }

  return {
    id,
    runDate,
    runTimezone,
    status,
    totalRecipients,
    sentCount,
    errorCount,
    totalEvents,
    startedAt,
    completedAt: completedAt ?? undefined,
    errorMessage: errorMessage ?? undefined,
    createdAt,
    deliveries,
  };
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function formatCreatedAt(value: string) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsedDate);
}

function formatRunStatusLabel(status: RunStatus) {
  if (status === "success") {
    return "Exito";
  }

  if (status === "partial") {
    return "Parcial";
  }

  if (status === "error") {
    return "Error";
  }

  return "En curso";
}

function getRunStatusClassName(status: RunStatus) {
  if (status === "success") {
    return "border border-emerald-300/35 bg-emerald-400/15 text-emerald-100";
  }

  if (status === "partial") {
    return "border border-amber-300/35 bg-amber-400/15 text-amber-100";
  }

  if (status === "error") {
    return "border border-red-300/35 bg-red-400/15 text-red-100";
  }

  return "border border-sky-300/35 bg-sky-400/15 text-sky-100";
}

export default function AnnualEmailPage() {
  const isTestOnlyMode =
    (process.env.NEXT_PUBLIC_EMAIL_PANEL_MODE ?? "")
      .trim()
      .toLowerCase() === "test";
  const [email, setEmail] = useState("");
  const [cronSecret, setCronSecret] = useState("");
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [runHistory, setRunHistory] = useState<NotificationRunHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);
  const [isRunningDaily, setIsRunningDaily] = useState(false);
  const [isRunDailyPanelOpen, setIsRunDailyPanelOpen] = useState(false);
  const [isCronSecretVisible, setIsCronSecretVisible] = useState(false);
  const [forceRunDaily, setForceRunDaily] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const runFeedbackTimeoutRef = useRef<number | null>(null);

  const totalActive = useMemo(
    () => recipients.filter((recipient) => recipient.isActive).length,
    [recipients]
  );

  async function loadRecipients() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/email-recipients", {
        cache: "no-store",
      });
      const body = (await response.json()) as
        | { data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudieron cargar los e-mails."
        );
      }

      const rows = Array.isArray(body.data) ? body.data : [];
      const normalized = rows
        .map((row) => normalizeRecipient(row))
        .filter((row): row is EmailRecipient => row !== null);
      setRecipients(normalized);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al cargar los e-mails.";
      setError(detail);
      setRecipients([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadRunHistory() {
    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const response = await fetch("/api/notifications/history?limit=20", {
        cache: "no-store",
      });
      const body = (await response.json()) as
        | { data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo cargar el historial de ejecuciones."
        );
      }

      const rows = Array.isArray(body.data) ? body.data : [];
      const normalized = rows
        .map((row) => normalizeRunHistory(row))
        .filter((row): row is NotificationRunHistory => row !== null);
      setRunHistory(normalized);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al cargar historial de ejecuciones.";
      setHistoryError(detail);
      setRunHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (isTestOnlyMode) {
      void loadRecipients();
      return;
    }

    void Promise.all([loadRecipients(), loadRunHistory()]);
  }, [isTestOnlyMode]);

  function clearRunFeedbackTimeout() {
    if (runFeedbackTimeoutRef.current !== null) {
      clearTimeout(runFeedbackTimeoutRef.current);
      runFeedbackTimeoutRef.current = null;
    }
  }

  function setRunMessageWithAutoHide(nextMessage: string) {
    clearRunFeedbackTimeout();
    setMessage(nextMessage);
    setError(null);
    runFeedbackTimeoutRef.current = window.setTimeout(() => {
      setMessage((current) => (current === nextMessage ? null : current));
      runFeedbackTimeoutRef.current = null;
    }, 10_000);
  }

  function setRunErrorWithAutoHide(nextError: string) {
    clearRunFeedbackTimeout();
    setError(nextError);
    setMessage(null);
    runFeedbackTimeoutRef.current = window.setTimeout(() => {
      setError((current) => (current === nextError ? null : current));
      runFeedbackTimeoutRef.current = null;
    }, 10_000);
  }

  useEffect(() => {
    return () => {
      clearRunFeedbackTimeout();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();

    if (!normalized || !EMAIL_PATTERN.test(normalized)) {
      setError("Debes ingresar un e-mail valido.");
      setMessage(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/email-recipients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalized,
        }),
      });
      const body = (await response.json()) as
        | { data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo guardar el e-mail."
        );
      }

      const inserted = normalizeRecipient(body.data);
      if (!inserted) {
        throw new Error("El servidor devolvio un registro invalido.");
      }

      setRecipients((current) => [inserted, ...current]);
      setEmail("");
      setMessage("E-mail agregado con exito.");
      setError(null);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al guardar el e-mail.";
      setError(detail);
      setMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(recipient: EmailRecipient) {
    setUpdatingId(recipient.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/email-recipients?id=${encodeURIComponent(recipient.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isActive: !recipient.isActive,
          }),
        }
      );
      const body = (await response.json()) as
        | { data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo actualizar el e-mail."
        );
      }

      const updated = normalizeRecipient(body.data);
      if (!updated) {
        throw new Error("El servidor devolvio un registro invalido.");
      }

      setRecipients((current) =>
        current.map((row) => (row.id === updated.id ? updated : row))
      );
      setMessage(
        updated.isActive
          ? "Destinatario activado."
          : "Destinatario pausado."
      );
      setError(null);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al actualizar el e-mail.";
      setError(detail);
      setMessage(null);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(recipient: EmailRecipient) {
    const shouldDelete = window.confirm(
      `Se eliminara ${recipient.email}. Deseas continuar?`
    );
    if (!shouldDelete) {
      return;
    }

    setDeletingId(recipient.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/email-recipients?id=${encodeURIComponent(recipient.id)}`,
        {
          method: "DELETE",
        }
      );
      const body = (await response.json()) as
        | { ok?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo eliminar el e-mail."
        );
      }

      setRecipients((current) =>
        current.filter((row) => row.id !== recipient.id)
      );
      setMessage("E-mail eliminado.");
      setError(null);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al eliminar el e-mail.";
      setError(detail);
      setMessage(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSendTest(recipient: EmailRecipient) {
    setSendingTestId(recipient.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/email-recipients/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientId: recipient.id,
        }),
      });
      const body = (await response.json()) as
        | { data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo enviar el e-mail de prueba."
        );
      }

      const payload = asRecord(body.data);
      const recipientEmail =
        asNonEmptyString(payload?.recipientEmail) ?? recipient.email;
      setMessage(`Prueba enviada a ${recipientEmail}.`);
      setError(null);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al enviar el e-mail de prueba.";
      setError(detail);
      setMessage(null);
    } finally {
      setSendingTestId(null);
    }
  }

  async function handleRunDailyNow() {
    const secret = normalizeCronSecretInput(cronSecret);
    if (!secret) {
      setRunErrorWithAutoHide(
        "Ingresa el CRON_SECRET para ejecutar el envio diario."
      );
      return;
    }

    setIsRunningDaily(true);
    clearRunFeedbackTimeout();
    setError(null);
    setMessage(null);

    try {
      const runDailyPath = forceRunDaily
        ? "/api/notifications/run-daily?force=true"
        : "/api/notifications/run-daily";
      const response = await fetch(runDailyPath, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      });
      const body = (await response.json()) as
        | { ok?: unknown; skipped?: unknown; reason?: unknown; data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo ejecutar el envio diario."
        );
      }

      const payload = asRecord(body);
      const skipped = payload?.skipped === true;
      const reason = asNonEmptyString(payload?.reason);
      const data = asRecord(payload?.data);
      const recipientsSummary = asRecord(data?.recipients);
      const sentCount = asNonNegativeInteger(recipientsSummary?.sent);
      const errorCount = asNonNegativeInteger(recipientsSummary?.errors);

      if (skipped) {
        setRunMessageWithAutoHide(
          reason
            ? `Ejecucion diaria omitida: ${reason}`
            : "Ejecucion diaria omitida."
        );
      } else {
        const sentLabel = sentCount ?? 0;
        const errorLabel = errorCount ?? 0;
        setRunMessageWithAutoHide(
          `Ejecucion diaria completada. Enviados: ${sentLabel}. Errores: ${errorLabel}.`
        );
      }
      await loadRunHistory();
      setError(null);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al ejecutar el envio diario.";
      setRunErrorWithAutoHide(detail);
    } finally {
      setIsRunningDaily(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <section className="relative z-40 overflow-visible rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -bottom-28 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <div className="relative z-[140] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBreadcrumb
                items={[
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "E-mails" },
                ]}
                className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
              />
              <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
                E-Mails de notificacion
              </h1>
              <p className="mt-2 text-sm text-slate-300/90">
                Destinatarios que recibiran el resumen diario de eventos.
              </p>
            </div>

            <div className="order-first flex flex-wrap items-center gap-2 self-end sm:order-none sm:self-auto">
              <UserNavbar
                showInlineIdentity
                className="z-[160]"
                dashboardHref="/anual/email"
              />
            </div>
          </div>

          <div className="relative z-10 mt-5 grid gap-3 rounded-2xl border border-white/20 bg-slate-950/45 p-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/16 bg-slate-900/68 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400/85">
                Total
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-100">
                {recipients.length}
              </p>
            </div>
            <div className="rounded-xl border border-white/16 bg-slate-900/68 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400/85">
                Activos
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-200">
                {totalActive}
              </p>
            </div>
            <div className="rounded-xl border border-white/16 bg-slate-900/68 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400/85">
                Inactivos
              </p>
              <p className="mt-1 text-2xl font-bold text-rose-200">
                {recipients.length - totalActive}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="relative z-10 mt-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-200/90">
              Agregar e-mail
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@dominio.com"
                  className="h-11 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-sky-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Guardando..." : "Agregar"}
                </button>
              </div>
            </label>
          </form>

          {isTestOnlyMode ? (
            <div className="relative z-10 mt-4 rounded-2xl border border-sky-300/35 bg-sky-400/15 p-4 text-sm text-sky-100">
              Modo pruebas activo: solo envio de test habilitado.
            </div>
          ) : (
            <div className="relative z-10 mt-4 rounded-2xl border border-white/20 bg-slate-950/45 p-4">
              <button
                type="button"
                onClick={() => setIsRunDailyPanelOpen((current) => !current)}
                aria-expanded={isRunDailyPanelOpen}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-1 py-1 text-left transition hover:border-white/10"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-300/35 bg-sky-400/20 text-sky-100">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 6h16" />
                      <path d="M4 18h16" />
                      <path d="M6 10l3 2-3 2" />
                      <path d="M11 14h6" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-100">
                      Ejecutar envio diario ahora
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-300/85">
                      Ingresa el CRON_SECRET y dispara manualmente el proceso
                      diario.
                    </span>
                  </span>
                </span>
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-slate-300/75 transition-transform ${
                    isRunDailyPanelOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 7 5 6 5-6" />
                </svg>
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ${
                  isRunDailyPanelOpen ? "mt-3 max-h-56 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="space-y-2">
                  <label className="inline-flex select-none items-center gap-2 text-xs text-slate-300/85">
                    <input
                      type="checkbox"
                      checked={forceRunDaily}
                      onChange={(event) => setForceRunDaily(event.target.checked)}
                      className="h-4 w-4 rounded border border-white/30 text-sky-400 accent-sky-400"
                    />
                    Forzar envio hoy (ignora el bloqueo de una ejecucion por dia)
                  </label>

                  <div className="space-y-2">
                    <div className="relative w-full">
                      <input
                        type={isCronSecretVisible ? "text" : "password"}
                        value={cronSecret}
                        onChange={(event) => setCronSecret(event.target.value)}
                        placeholder="CRON_SECRET"
                        className="hide-password-reveal h-11 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 pr-12 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setIsCronSecretVisible((current) => !current)
                        }
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-200 transition hover:bg-white/10"
                        aria-label={
                          isCronSecretVisible
                            ? "Ocultar CRON_SECRET"
                            : "Mostrar CRON_SECRET"
                        }
                        title={
                          isCronSecretVisible
                            ? "Ocultar CRON_SECRET"
                            : "Mostrar CRON_SECRET"
                        }
                      >
                        {isCronSecretVisible ? (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2 2l20 20" />
                            <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" />
                            <path d="M9.9 4.24A10.8 10.8 0 0 1 12 4c5.6 0 10 8 10 8a18.3 18.3 0 0 1-3.47 4.3" />
                            <path d="M6.52 6.52A18.2 18.2 0 0 0 2 12s4.4 8 10 8a10.8 10.8 0 0 0 5.48-1.52" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2 12s4.4-8 10-8 10 8 10 8-4.4 8-10 8-10-8-10-8Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          void handleRunDailyNow();
                        }}
                        disabled={isRunningDaily}
                        aria-label={
                          isRunningDaily
                            ? "Ejecutando envio diario"
                            : forceRunDaily
                              ? "Forzar envio diario ahora"
                              : "Ejecutar envio diario ahora"
                        }
                        title={
                          isRunningDaily
                            ? "Ejecutando envio diario"
                            : forceRunDaily
                              ? "Forzar envio diario ahora"
                              : "Ejecutar envio diario ahora"
                        }
                        aria-busy={isRunningDaily}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-300/35 bg-sky-400/25 text-sky-100 transition hover:bg-sky-400/32 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRunningDaily ? (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-4 w-4 animate-spin"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle
                              cx="12"
                              cy="12"
                              r="9"
                              className="opacity-25"
                            />
                            <path d="M21 12a9 9 0 0 0-9-9" />
                          </svg>
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-4 w-4"
                            fill="currentColor"
                          >
                            <path d="M8 6v12l10-6-10-6Z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {message ? (
            <p className="relative z-10 mt-4 rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-4 py-3 text-sm text-emerald-100">
              {message}
            </p>
          ) : null}

          {error ? (
            <p className="relative z-10 mt-4 rounded-xl border border-red-300/35 bg-red-400/15 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
        </section>

        <section className="relative z-10 overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <h2 className="relative z-10 text-xl font-bold text-slate-100">Destinatarios</h2>

          {isLoading ? (
            <div className="relative z-10 mt-4 space-y-2" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`email-skeleton-${index}`}
                  className="auth-skeleton h-14 rounded-xl border border-white/15 bg-slate-900/60"
                />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <p className="relative z-10 mt-4 rounded-xl border border-white/16 bg-slate-950/52 px-4 py-3 text-sm text-slate-300/85">
              Aun no hay e-mails cargados.
            </p>
          ) : (
            <ul className="relative z-10 mt-4 space-y-2">
              {recipients.map((recipient) => {
                const isUpdating = updatingId === recipient.id;
                const isDeleting = deletingId === recipient.id;
                const isSendingTest = sendingTestId === recipient.id;
                const isBusy = isUpdating || isDeleting || isSendingTest;

                return (
                  <li
                    key={recipient.id}
                    className="rounded-xl border border-white/16 bg-slate-900/62 p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {recipient.email}
                        </p>
                        <p className="mt-1 text-xs text-slate-300/75">
                          Cargado: {formatCreatedAt(recipient.createdAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            recipient.isActive
                              ? "border border-emerald-300/35 bg-emerald-400/15 text-emerald-100"
                              : "border border-red-300/35 bg-red-400/15 text-red-100"
                          }`}
                        >
                          {recipient.isActive ? "Activo" : "Pausado"}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            void handleSendTest(recipient);
                          }}
                          disabled={isBusy || !recipient.isActive}
                          className="inline-flex rounded-full border border-sky-300/35 bg-sky-400/20 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-400/28 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSendingTest ? "Enviando..." : "Enviar prueba"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void handleToggle(recipient);
                          }}
                          disabled={isBusy}
                          className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isUpdating
                            ? "Actualizando..."
                            : recipient.isActive
                              ? "Pausar"
                              : "Activar"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void handleDelete(recipient);
                          }}
                          disabled={isBusy}
                          className="inline-flex rounded-full border border-red-300/35 bg-red-400/15 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-400/24 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeleting ? "Eliminando..." : "Eliminar"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {isTestOnlyMode ? null : (
          <section className="relative z-10 overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-indigo-300/10 blur-3xl"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-slate-100">
                Historial de envios diarios
              </h2>
              <button
                type="button"
                onClick={() => {
                  void loadRunHistory();
                }}
                disabled={isLoadingHistory}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoadingHistory ? "Actualizando..." : "Actualizar historial"}
              </button>
            </div>

            {historyError ? (
              <p className="mt-4 rounded-xl border border-red-300/35 bg-red-400/15 px-4 py-3 text-sm text-red-100">
                {historyError}
              </p>
            ) : null}

            {isLoadingHistory ? (
              <div className="mt-4 space-y-3" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`run-skeleton-${index}`}
                    className="auth-skeleton h-28 rounded-xl border border-white/15 bg-slate-900/60"
                  />
                ))}
              </div>
            ) : runHistory.length === 0 ? (
              <p className="mt-4 rounded-xl border border-white/16 bg-slate-950/52 px-4 py-3 text-sm text-slate-300/85">
                Aun no hay ejecuciones diarias registradas.
              </p>
            ) : (
              <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1 sm:max-h-[38rem] sm:pr-2">
                {runHistory.map((run) => {
                  const visibleDeliveries = run.deliveries.slice(0, 20);
                  const hasMoreDeliveries =
                    run.deliveries.length > visibleDeliveries.length;

                  return (
                    <article
                      key={run.id}
                      className="rounded-xl border border-white/16 bg-slate-900/62 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-100">
                            Fecha {run.runDate} ({run.runTimezone})
                          </p>
                          <p className="mt-1 text-xs text-slate-300/75">
                            Inicio: {formatCreatedAt(run.startedAt)}
                            {run.completedAt
                              ? ` | Fin: ${formatCreatedAt(run.completedAt)}`
                              : ""}
                          </p>
                        </div>

                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRunStatusClassName(
                            run.status
                          )}`}
                        >
                          {formatRunStatusLabel(run.status)}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-white/16 bg-slate-950/55 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400/85">
                            Destinatarios
                          </p>
                          <p className="text-sm font-semibold text-slate-100">
                            {run.totalRecipients}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/16 bg-slate-950/55 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400/85">
                            Eventos
                          </p>
                          <p className="text-sm font-semibold text-slate-100">
                            {run.totalEvents}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/16 bg-slate-950/55 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400/85">
                            Enviados
                          </p>
                          <p className="text-sm font-semibold text-emerald-200">
                            {run.sentCount}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/16 bg-slate-950/55 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide text-slate-400/85">
                            Errores
                          </p>
                          <p className="text-sm font-semibold text-red-200">
                            {run.errorCount}
                          </p>
                        </div>
                      </div>

                      {run.errorMessage ? (
                        <p className="mt-3 rounded-lg border border-red-300/35 bg-red-400/15 px-3 py-2 text-xs text-red-100">
                          {run.errorMessage}
                        </p>
                      ) : null}

                      <details className="mt-3 rounded-lg border border-white/16 bg-slate-950/55 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-300/90">
                          Deliveries ({run.deliveries.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                          {visibleDeliveries.length === 0 ? (
                            <p className="text-xs text-slate-300/75">
                              No hay deliveries para este run.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {visibleDeliveries.map((delivery) => (
                                <li
                                  key={delivery.id}
                                  className="rounded-md border border-white/14 bg-slate-900/55 px-2 py-1.5"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-100">
                                      {delivery.recipientEmail}
                                    </span>
                                    <span
                                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                        delivery.status === "sent"
                                          ? "border border-emerald-300/35 bg-emerald-400/15 text-emerald-100"
                                          : "border border-red-300/35 bg-red-400/15 text-red-100"
                                      }`}
                                    >
                                      {delivery.status === "sent"
                                        ? "Enviado"
                                        : "Error"}
                                    </span>
                                    <span className="text-[11px] text-slate-400/85">
                                      {formatCreatedAt(delivery.createdAt)}
                                    </span>
                                  </div>
                                  {delivery.errorMessage ? (
                                    <p className="mt-1 text-[11px] text-red-100">
                                      {delivery.errorMessage}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                          {hasMoreDeliveries ? (
                            <p className="text-[11px] text-slate-400/85">
                              Mostrando {visibleDeliveries.length} de{" "}
                              {run.deliveries.length} deliveries.
                            </p>
                          ) : null}
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

