import { NextResponse } from "next/server";
import { requireRoleSession } from "@/lib/auth/server-auth";
import {
  readSupabaseErrorMessage,
  SupabaseConfigError,
  supabaseRestFetch,
} from "@/lib/supabase-rest";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 60;

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.normalize("NFC").trim();
  return normalized.length > 0 ? normalized : null;
}

function asNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function normalizeRunStatus(value: unknown): RunStatus | null {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  if (
    parsed === "running" ||
    parsed === "success" ||
    parsed === "partial" ||
    parsed === "error"
  ) {
    return parsed;
  }

  return null;
}

function normalizeDeliveryStatus(value: unknown): DeliveryStatus | null {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  if (parsed === "sent" || parsed === "error") {
    return parsed;
  }

  return null;
}

function normalizeRunRow(row: unknown): Omit<NotificationRunHistory, "deliveries"> | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const runDate = asNonEmptyString(parsed.run_date) ?? asNonEmptyString(parsed.runDate);
  const runTimezone =
    asNonEmptyString(parsed.run_timezone) ??
    asNonEmptyString(parsed.runTimezone) ??
    "America/Argentina/Buenos_Aires";
  const status = normalizeRunStatus(parsed.status);
  const totalRecipients =
    asNonNegativeInteger(parsed.total_recipients) ??
    asNonNegativeInteger(parsed.totalRecipients);
  const sentCount =
    asNonNegativeInteger(parsed.sent_count) ?? asNonNegativeInteger(parsed.sentCount);
  const errorCount =
    asNonNegativeInteger(parsed.error_count) ?? asNonNegativeInteger(parsed.errorCount);
  const totalEvents =
    asNonNegativeInteger(parsed.total_events) ?? asNonNegativeInteger(parsed.totalEvents);
  const startedAt =
    asNonEmptyString(parsed.started_at) ?? asNonEmptyString(parsed.startedAt);
  const completedAt =
    asNonEmptyString(parsed.completed_at) ?? asNonEmptyString(parsed.completedAt);
  const errorMessage =
    asNonEmptyString(parsed.error_message) ?? asNonEmptyString(parsed.errorMessage);
  const createdAt =
    asNonEmptyString(parsed.created_at) ?? asNonEmptyString(parsed.createdAt);

  if (
    !id ||
    !runDate ||
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
  };
}

function normalizeDeliveryRow(row: unknown): NotificationDeliveryHistory | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const runId = asNonEmptyString(parsed.run_id) ?? asNonEmptyString(parsed.runId);
  const recipientEmail =
    asNonEmptyString(parsed.recipient_email) ??
    asNonEmptyString(parsed.recipientEmail);
  const status = normalizeDeliveryStatus(parsed.status);
  const provider = asNonEmptyString(parsed.provider) ?? "brevo";
  const providerMessageId =
    asNonEmptyString(parsed.provider_message_id) ??
    asNonEmptyString(parsed.providerMessageId);
  const errorMessage =
    asNonEmptyString(parsed.error_message) ?? asNonEmptyString(parsed.errorMessage);
  const createdAt =
    asNonEmptyString(parsed.created_at) ?? asNonEmptyString(parsed.createdAt);

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

function parseLimit(raw: string | null) {
  if (!raw) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function getRunsPath(limit: number) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,run_date,run_timezone,status,total_recipients,sent_count,error_count,total_events,started_at,completed_at,error_message,created_at"
  );
  params.set("order", "run_date.desc,created_at.desc");
  params.set("limit", String(limit));
  return `notification_runs?${params.toString()}`;
}

function getDeliveriesPath(runIds: string[]) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,run_id,recipient_email,status,provider,provider_message_id,error_message,created_at"
  );
  params.set("run_id", `in.(${runIds.join(",")})`);
  params.set("order", "created_at.desc");
  return `notification_deliveries?${params.toString()}`;
}

function formatRouteError(caught: unknown, fallback: string) {
  if (caught instanceof SupabaseConfigError) {
    return caught.message;
  }

  if (caught instanceof Error) {
    return caught.message;
  }

  return fallback;
}

export async function GET(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get("limit"));
    const runsResponse = await supabaseRestFetch(getRunsPath(limit));

    if (!runsResponse.ok) {
      const message = await readSupabaseErrorMessage(
        runsResponse,
        "No se pudo consultar el historial de ejecuciones."
      );
      return NextResponse.json({ error: message }, { status: runsResponse.status });
    }

    const runsBody = (await runsResponse.json()) as unknown;
    const runRows = Array.isArray(runsBody) ? runsBody : [];
    const normalizedRuns = runRows
      .map((row) => normalizeRunRow(row))
      .filter((row): row is Omit<NotificationRunHistory, "deliveries"> => row !== null);

    if (normalizedRuns.length === 0) {
      return NextResponse.json(
        { data: [] as NotificationRunHistory[] },
        { headers: NO_STORE_HEADERS }
      );
    }

    const runIds = normalizedRuns.map((run) => run.id);
    const deliveriesResponse = await supabaseRestFetch(getDeliveriesPath(runIds));

    if (!deliveriesResponse.ok) {
      const message = await readSupabaseErrorMessage(
        deliveriesResponse,
        "No se pudo consultar el detalle de envios."
      );
      return NextResponse.json(
        { error: message },
        { status: deliveriesResponse.status }
      );
    }

    const deliveriesBody = (await deliveriesResponse.json()) as unknown;
    const deliveryRows = Array.isArray(deliveriesBody) ? deliveriesBody : [];
    const normalizedDeliveries = deliveryRows
      .map((row) => normalizeDeliveryRow(row))
      .filter((row): row is NotificationDeliveryHistory => row !== null);

    const deliveriesByRunId = new Map<string, NotificationDeliveryHistory[]>();
    for (const delivery of normalizedDeliveries) {
      const current = deliveriesByRunId.get(delivery.runId) ?? [];
      current.push(delivery);
      deliveriesByRunId.set(delivery.runId, current);
    }

    const result: NotificationRunHistory[] = normalizedRuns.map((run) => ({
      ...run,
      deliveries: deliveriesByRunId.get(run.id) ?? [],
    }));

    return NextResponse.json(
      { data: result },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al consultar historial de notificaciones."
        ),
      },
      { status: 500 }
    );
  }
}
