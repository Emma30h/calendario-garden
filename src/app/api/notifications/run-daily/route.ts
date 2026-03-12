import { NextResponse } from "next/server";
import { BrevoConfigError, sendBrevoTransactionalEmail } from "@/lib/brevo";
import {
  readSupabaseErrorMessage,
  SupabaseConfigError,
  supabaseRestFetch,
} from "@/lib/supabase-rest";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const DEFAULT_TIME_ZONE = "America/Argentina/Buenos_Aires";
const RUN_STATUS_VALUES = ["running", "success", "partial", "error"] as const;
const EFEMERIDE_TYPES = new Set<EfemerideType>([
  "cumpleanos",
  "aniversario",
  "dia",
  "sin_novedad",
  "otro",
]);
const EVENT_TYPE_PRIORITY: Record<EfemerideType, number> = {
  aniversario: 0,
  cumpleanos: 1,
  dia: 2,
  otro: 3,
  sin_novedad: 4,
};
type RunStatus = (typeof RUN_STATUS_VALUES)[number];
type RunSource = "scheduled" | "forced";

type NotificationRunRow = {
  id: string;
  runDate: string;
  status: RunStatus;
  totalRecipients: number;
  sentCount: number;
  errorCount: number;
  totalEvents: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
};

type ActiveRecipient = {
  email: string;
};

type EfemerideType =
  | "cumpleanos"
  | "aniversario"
  | "dia"
  | "sin_novedad"
  | "otro";

type DailyEvent = {
  type: EfemerideType;
  title: string;
  source: "garden_db" | "pdf_efemerides";
};

type BirthdayDailyEventRow = {
  fullName: string;
  birthDate: string;
  area: string | null;
  turno: string | null;
  personalCategory: string | null;
  policialRole: string | null;
};

type EfemeridesEventRow = {
  year: number;
  month: number;
  day: number;
  type: EfemerideType;
  title: string;
};

type EfemeridesMonthRow = {
  sourceName: string;
  events: EfemeridesEventRow[];
};

type DeliveryPayload = {
  run_id: string;
  recipient_email: string;
  status: "sent" | "error";
  provider: "brevo";
  provider_message_id: string | null;
  error_message: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeInputText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeInputText(value);
  return normalized.length > 0 ? normalized : null;
}

function asNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function asInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeStatus(value: unknown): RunStatus | null {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  if ((RUN_STATUS_VALUES as readonly string[]).includes(parsed)) {
    return parsed as RunStatus;
  }

  return null;
}

function ensureBrevoEnv() {
  const apiKey = asNonEmptyString(process.env.BREVO_API_KEY);
  const senderEmail = asNonEmptyString(process.env.BREVO_SENDER_EMAIL);

  if (!apiKey) {
    throw new BrevoConfigError("Falta BREVO_API_KEY.");
  }

  if (!senderEmail) {
    throw new BrevoConfigError("Falta BREVO_SENDER_EMAIL.");
  }
}

function getAppTimeZone() {
  return asNonEmptyString(process.env.APP_TIMEZONE) ?? DEFAULT_TIME_ZONE;
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("No se pudo calcular la fecha local para notificaciones.");
  }

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    isoDate: `${year}-${month}-${day}`,
    mmdd: `${month}-${day}`,
  };
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeRunRow(row: unknown): NotificationRunRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const runDate = asNonEmptyString(parsed.run_date) ?? asNonEmptyString(parsed.runDate);
  const status = normalizeStatus(parsed.status);
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

  if (
    !id ||
    !runDate ||
    !isIsoDate(runDate) ||
    !status ||
    totalRecipients === null ||
    sentCount === null ||
    errorCount === null ||
    totalEvents === null ||
    !startedAt
  ) {
    return null;
  }

  return {
    id,
    runDate,
    status,
    totalRecipients,
    sentCount,
    errorCount,
    totalEvents,
    startedAt,
    completedAt: completedAt ?? undefined,
    errorMessage: errorMessage ?? undefined,
  };
}

function normalizeRecipientRow(row: unknown): ActiveRecipient | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const email = asNonEmptyString(parsed.email);
  if (!email) {
    return null;
  }

  return {
    email: email.toLowerCase(),
  };
}

function normalizeBirthdayDailyEventRow(row: unknown): BirthdayDailyEventRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const firstName = asNonEmptyString(parsed.first_name);
  const lastName = asNonEmptyString(parsed.last_name);
  const birthDate = asNonEmptyString(parsed.birth_date);

  if (!firstName || !lastName || !birthDate || !isIsoDate(birthDate)) {
    return null;
  }

  return {
    fullName: `${lastName}, ${firstName}`,
    birthDate,
    area: asNonEmptyString(parsed.area),
    turno: asNonEmptyString(parsed.turno),
    personalCategory:
      asNonEmptyString(parsed.personal_category) ??
      asNonEmptyString(parsed.personalCategory),
    policialRole:
      asNonEmptyString(parsed.policial_role) ?? asNonEmptyString(parsed.policialRole),
  };
}

function isEfemerideType(value: unknown): value is EfemerideType {
  return typeof value === "string" && EFEMERIDE_TYPES.has(value as EfemerideType);
}

function normalizeEfemeridesEventRow(row: unknown): EfemeridesEventRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const year = asInteger(parsed.year);
  const month = asInteger(parsed.month);
  const day = asInteger(parsed.day);
  const title = asNonEmptyString(parsed.title);
  const type = parsed.type;

  if (
    year === null ||
    month === null ||
    day === null ||
    !title ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    !isEfemerideType(type)
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    type,
    title,
  };
}

function normalizeEfemeridesMonthRow(row: unknown): EfemeridesMonthRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const sourceName =
    asNonEmptyString(parsed.source_name) ??
    asNonEmptyString(parsed.sourceName) ??
    "PDF mensual";
  const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
  const events = rawEvents
    .map((event) => normalizeEfemeridesEventRow(event))
    .filter((event): event is EfemeridesEventRow => event !== null);

  return {
    sourceName,
    events,
  };
}

function getDailyRunLookupPath(runDateIso: string) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,run_date,run_source,status,total_recipients,sent_count,error_count,total_events,started_at,completed_at,error_message"
  );
  params.set("run_date", `eq.${runDateIso}`);
  params.set("run_source", "eq.scheduled");
  params.set("limit", "1");
  return `notification_runs?${params.toString()}`;
}

function getRunInsertPath() {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,run_date,run_source,status,total_recipients,sent_count,error_count,total_events,started_at,completed_at,error_message"
  );
  return `notification_runs?${params.toString()}`;
}

function getRunUpdatePath(runId: string) {
  const params = new URLSearchParams();
  params.set("id", `eq.${runId}`);
  params.set(
    "select",
    "id,run_date,run_source,status,total_recipients,sent_count,error_count,total_events,started_at,completed_at,error_message"
  );
  return `notification_runs?${params.toString()}`;
}

function getActiveRecipientsPath() {
  const params = new URLSearchParams();
  params.set("select", "email");
  params.set("is_active", "eq.true");
  params.set("order", "created_at.asc");
  return `email_recipients?${params.toString()}`;
}

function getBirthdaysPath() {
  const params = new URLSearchParams();
  params.set(
    "select",
    "first_name,last_name,birth_date,area,turno,personal_category,policial_role"
  );
  params.set("order", "last_name.asc,first_name.asc,birth_date.asc");
  return `birthdays?${params.toString()}`;
}

function getEfemeridesPath(year: number, month: number) {
  const params = new URLSearchParams();
  params.set("select", "source_name,events");
  params.set("year", `eq.${year}`);
  params.set("month", `eq.${month}`);
  params.set("limit", "1");
  return `efemerides?${params.toString()}`;
}

async function getRunByDate(runDateIso: string): Promise<NotificationRunRow | null> {
  const response = await supabaseRestFetch(getDailyRunLookupPath(runDateIso));

  if (!response.ok) {
    throw new Error(
      await readSupabaseErrorMessage(
        response,
        "No se pudo consultar el estado de ejecucion diaria."
      )
    );
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) {
    return null;
  }

  return normalizeRunRow(rows[0]);
}

async function createRun(payload: Record<string, unknown>) {
  const response = await supabaseRestFetch(getRunInsertPath(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo registrar el inicio de la ejecucion diaria."
    );
    throw new Error(message);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  const created = rows.length > 0 ? normalizeRunRow(rows[0]) : null;

  if (!created) {
    throw new Error("El servidor no devolvio un run valido.");
  }

  return created;
}

async function updateRun(
  runId: string,
  payload: Record<string, unknown>
): Promise<NotificationRunRow> {
  const response = await supabaseRestFetch(getRunUpdatePath(runId), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo actualizar el estado de la ejecucion diaria."
    );
    throw new Error(message);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  const updated = rows.length > 0 ? normalizeRunRow(rows[0]) : null;

  if (!updated) {
    throw new Error("El servidor no devolvio un run actualizado valido.");
  }

  return updated;
}

async function insertDeliveries(payload: DeliveryPayload[]) {
  if (payload.length === 0) {
    return;
  }

  const response = await supabaseRestFetch("notification_deliveries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readSupabaseErrorMessage(
        response,
        "No se pudieron registrar los deliveries del run diario."
      )
    );
  }
}

async function fetchActiveRecipients() {
  const response = await supabaseRestFetch(getActiveRecipientsPath());

  if (!response.ok) {
    throw new Error(
      await readSupabaseErrorMessage(
        response,
        "No se pudieron consultar los destinatarios activos."
      )
    );
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows
    .map((row) => normalizeRecipientRow(row))
    .filter((row): row is ActiveRecipient => row !== null);
}

function matchesMonthDay(isoDate: string, month: number, day: number) {
  return isoDate.slice(5, 10) === `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatBirthdayEventLabel(event: BirthdayDailyEventRow) {
  const extras: string[] = [];
  if (event.personalCategory) {
    extras.push(event.personalCategory);
  }
  if (event.policialRole) {
    extras.push(event.policialRole);
  }
  if (event.area) {
    extras.push(event.area);
  }
  if (event.turno) {
    extras.push(`Turno ${event.turno}`);
  }

  return extras.length > 0 ? `${event.fullName} (${extras.join(" | ")})` : event.fullName;
}

async function fetchBirthdayEventsForDay(month: number, day: number): Promise<DailyEvent[]> {
  const response = await supabaseRestFetch(getBirthdaysPath());

  if (!response.ok) {
    throw new Error(
      await readSupabaseErrorMessage(
        response,
        "No se pudieron consultar los eventos del dia."
      )
    );
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows
    .map((row) => normalizeBirthdayDailyEventRow(row))
    .filter((row): row is BirthdayDailyEventRow => row !== null)
    .filter((row) => matchesMonthDay(row.birthDate, month, day))
    .map((row) => ({
      type: "cumpleanos" as const,
      title: formatBirthdayEventLabel(row),
      source: "garden_db" as const,
    }));
}

async function fetchEfemeridesEventsForDay(
  year: number,
  month: number,
  day: number
): Promise<DailyEvent[]> {
  const response = await supabaseRestFetch(getEfemeridesPath(year, month));

  if (!response.ok) {
    throw new Error(
      await readSupabaseErrorMessage(
        response,
        "No se pudieron consultar los eventos de efemerides para el dia."
      )
    );
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  const monthPayload =
    rows
      .map((row) => normalizeEfemeridesMonthRow(row))
      .find((row): row is EfemeridesMonthRow => row !== null) ?? null;

  if (!monthPayload) {
    return [];
  }

  return monthPayload.events
    .filter(
      (event) =>
        event.year === year && event.month === month && event.day === day
    )
    .map((event) => ({
      type: event.type,
      title: event.title,
      source: "pdf_efemerides" as const,
    }));
}

function sortDailyEvents(events: DailyEvent[]) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const priorityDiff =
        EVENT_TYPE_PRIORITY[a.event.type] - EVENT_TYPE_PRIORITY[b.event.type];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return a.index - b.index;
    })
    .map((item) => item.event);
}

async function fetchEventsForDay(
  year: number,
  month: number,
  day: number
): Promise<DailyEvent[]> {
  const [efemeridesEvents, birthdayEvents] = await Promise.all([
    fetchEfemeridesEventsForDay(year, month, day),
    fetchBirthdayEventsForDay(month, day),
  ]);

  return sortDailyEvents([...efemeridesEvents, ...birthdayEvents]);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEventLabel(event: DailyEvent) {
  return event.title;
}

function formatEventTypeLabel(type: EfemerideType) {
  if (type === "cumpleanos") return "Cumpleanos";
  if (type === "aniversario") return "Aniversario";
  if (type === "dia") return "Dia";
  if (type === "sin_novedad") return "Sin novedad";
  return "Otro";
}

function getEventTypePalette(type: EfemerideType) {
  if (type === "cumpleanos") {
    return { bg: "#eefdf1", text: "#1f6b2d" };
  }

  if (type === "aniversario") {
    return { bg: "#eaf4ff", text: "#1f4a78" };
  }

  if (type === "dia") {
    return { bg: "#fff3e8", text: "#8c4a10" };
  }

  if (type === "sin_novedad") {
    return { bg: "#f1f5f1", text: "#526152" };
  }

  return { bg: "#edf0ff", text: "#3a4488" };
}

function getPublicBaseUrl(request: Request) {
  const configuredBaseUrl =
    asNonEmptyString(process.env.APP_BASE_URL) ??
    asNonEmptyString(process.env.NEXT_PUBLIC_APP_BASE_URL) ??
    asNonEmptyString(process.env.NEXT_PUBLIC_SITE_URL) ??
    (asNonEmptyString(process.env.VERCEL_URL)
      ? `https://${asNonEmptyString(process.env.VERCEL_URL)}`
      : null);

  return configuredBaseUrl ?? new URL(request.url).origin;
}

function resolvePublicAssetUrl(request: Request, assetPath: string) {
  const base = getPublicBaseUrl(request);

  try {
    const normalizedPath = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
    return new URL(normalizedPath, base).toString();
  } catch {
    return null;
  }
}

function resolveEmailLogoUrl(request: Request) {
  const configuredLogo =
    asNonEmptyString(process.env.APP_LOGO_URL) ??
    asNonEmptyString(process.env.NEXT_PUBLIC_APP_LOGO_URL);

  if (!configuredLogo) {
    return resolvePublicAssetUrl(request, "/logo-ojos-en-alerta-blanco.png");
  }

  try {
    return new URL(configuredLogo).toString();
  } catch {
    try {
      return new URL(configuredLogo, getPublicBaseUrl(request)).toString();
    } catch {
      return null;
    }
  }
}

function buildDailyNotificationTemplate(
  dateLabel: string,
  events: DailyEvent[],
  logoUrl: string | null
) {
  const subject = `Eventos del dia - ${dateLabel} - Calendario Garden`;
  const birthdayCount = events.filter((event) => event.type === "cumpleanos").length;
  const anniversaryCount = events.filter(
    (event) => event.type === "aniversario"
  ).length;
  const dayCount = events.filter((event) => event.type === "dia").length;
  const otherCount = events.length - birthdayCount - anniversaryCount - dayCount;
  const itemsText = events.map(
    (event, index) =>
      `${index + 1}. [${formatEventTypeLabel(event.type)}] ${formatEventLabel(event)}`
  );
  const textContent = [
    `Hola, este es el resumen diario de eventos de Calendario Garden para ${dateLabel}.`,
    "",
    `Total de eventos: ${events.length}.`,
    `- Cumpleanos: ${birthdayCount}`,
    `- Aniversarios: ${anniversaryCount}`,
    `- Dias: ${dayCount}`,
    `- Otros: ${otherCount}`,
    "",
    ...itemsText,
  ].join("\n");

  const htmlItems = events
    .map((event, index) => {
      const typePalette = getEventTypePalette(event.type);

      return `
        <tr>
          <td style="padding: 0 0 10px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #dde7d6; border-radius: 10px; background: #ffffff;">
              <tr>
                <td width="36" valign="top" style="padding: 11px 0; text-align: center; font-size: 13px; font-weight: 700; color: #60706a; border-right: 1px solid #e6eee2;">
                  ${index + 1}
                </td>
                <td style="padding: 10px 12px;">
                  <p style="margin: 0 0 6px;">
                    <span style="display: inline-block; margin-right: 6px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: ${typePalette.text}; background: ${typePalette.bg};">
                      ${escapeHtml(formatEventTypeLabel(event.type))}
                    </span>
                  </p>
                  <p style="margin: 0; font-size: 14px; line-height: 1.45; color: #1c2722;">
                    ${escapeHtml(formatEventLabel(event))}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `;
    })
    .join("");

  const htmlContent = `
    <div style="margin: 0; padding: 22px 14px; background: #edf4ea;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 700px; margin: 0 auto; border-collapse: collapse; font-family: Arial, sans-serif;">
        <tr>
          <td style="padding: 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; background: #ffffff; border: 1px solid #d6e3cf; border-radius: 14px;">
              <tr>
                <td style="padding: 18px 22px; background: #193526; border-bottom: 1px solid #0f2318;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    <tr>
                      <td width="124" valign="middle" style="padding: 0 12px 0 0;">
                        ${
                          logoUrl
                            ? `<img src="${escapeHtml(logoUrl)}" alt="Ojos en Alerta" width="108" style="display: block; width: 108px; max-width: 100%; height: auto;" />`
                            : `<div style="width: 108px; height: 32px; line-height: 32px; text-align: center; border-radius: 7px; background: #2a4b3a; color: #e8f4ed; font-size: 12px; font-weight: 700;">OJOS EN ALERTA</div>`
                        }
                      </td>
                      <td valign="middle" style="padding: 0;">
                        <p style="margin: 0; color: #f4fbf2; font-size: 21px; font-weight: 700; line-height: 1.2;">
                          Ojos en Alerta
                        </p>
                        <p style="margin: 4px 0 0; color: #d0e2d8; font-size: 12px; letter-spacing: 0.3px;">
                          Resumen diario de eventos
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 14px 22px 6px;">
                  <p style="margin: 0 0 10px; font-size: 14px; color: #2e4333;">
                    Fecha: <strong>${escapeHtml(dateLabel)}</strong>
                  </p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    <tr>
                      <td style="padding: 0 6px 8px 0;" width="25%">
                        <div style="padding: 10px 12px; border: 1px solid #dce7d5; border-radius: 10px; background: #f9fcf8;">
                          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #6b7b74;">Total</p>
                          <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #22331d;">${events.length}</p>
                        </div>
                      </td>
                      <td style="padding: 0 6px 8px 6px;" width="25%">
                        <div style="padding: 10px 12px; border: 1px solid #dce7d5; border-radius: 10px; background: #f9fcf8;">
                          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #6b7b74;">Cumpleanos</p>
                          <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #225a2f;">${birthdayCount}</p>
                        </div>
                      </td>
                      <td style="padding: 0 6px 8px 6px;" width="25%">
                        <div style="padding: 10px 12px; border: 1px solid #dce7d5; border-radius: 10px; background: #f9fcf8;">
                          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #6b7b74;">Aniversarios</p>
                          <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #2f4d79;">${anniversaryCount}</p>
                        </div>
                      </td>
                      <td style="padding: 0 0 8px 6px;" width="25%">
                        <div style="padding: 10px 12px; border: 1px solid #dce7d5; border-radius: 10px; background: #f9fcf8;">
                          <p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #6b7b74;">Dia/Otros</p>
                          <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #8c4a10;">${dayCount + otherCount}</p>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 22px 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                    ${htmlItems}
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 0 22px 18px;">
                  <p style="margin: 0; font-size: 12px; color: #60706a;">
                    Este correo fue generado automaticamente por Calendario Garden.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    subject,
    textContent,
    htmlContent,
  };
}

function requireCronAuthorization(request: Request) {
  const configuredSecret = asNonEmptyString(process.env.CRON_SECRET);
  if (!configuredSecret) {
    throw new Error("Falta CRON_SECRET.");
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const xCronSecret = request.headers.get("x-cron-secret")?.trim() ?? null;
  const providedSecret = bearerToken || xCronSecret;

  return providedSecret === configuredSecret;
}

function parseForceFlag(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "si" ||
    normalized === "on"
  );
}

function shouldForceRun(request: Request) {
  const { searchParams } = new URL(request.url);
  return (
    parseForceFlag(searchParams.get("force")) ||
    parseForceFlag(request.headers.get("x-force-run"))
  );
}

function formatRouteError(caught: unknown, fallback: string) {
  if (caught instanceof SupabaseConfigError || caught instanceof BrevoConfigError) {
    return caught.message;
  }

  if (caught instanceof Error) {
    return caught.message;
  }

  return fallback;
}

export async function POST(request: Request) {
  let createdRunId: string | null = null;

  try {
    const authorized = requireCronAuthorization(request);
    if (!authorized) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    ensureBrevoEnv();

    const timeZone = getAppTimeZone();
    const now = new Date();
    const dateParts = getDatePartsInTimeZone(now, timeZone);
    const runDateIso = dateParts.isoDate;
    const runDateLabel = new Intl.DateTimeFormat("es-AR", {
      timeZone,
      dateStyle: "full",
    }).format(now);
    const emailLogoUrl = resolveEmailLogoUrl(request);
    const forceRun = shouldForceRun(request);

    const existingScheduledRun = await getRunByDate(runDateIso);
    if (existingScheduledRun && !forceRun) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "El envio diario ya fue ejecutado para la fecha local actual.",
          data: {
            run: existingScheduledRun,
          },
        },
        {
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const [recipients, events] = await Promise.all([
      fetchActiveRecipients(),
      fetchEventsForDay(dateParts.year, dateParts.month, dateParts.day),
    ]);

    const startedAt = new Date().toISOString();
    const runSeedPayload = {
      run_timezone: timeZone,
      status: "running",
      total_recipients: recipients.length,
      sent_count: 0,
      error_count: 0,
      total_events: events.length,
      started_at: startedAt,
      completed_at: null,
      error_message: null,
    };

    const runSource: RunSource = forceRun ? "forced" : "scheduled";
    const createdRun = await createRun({
      run_date: runDateIso,
      run_source: runSource,
      ...runSeedPayload,
    });
    const runId = createdRun.id;
    createdRunId = createdRun.id;

    if (recipients.length === 0 || events.length === 0) {
      const reason =
        recipients.length === 0
          ? "No hay destinatarios activos."
          : "No hay eventos para la fecha local actual.";
      const finalized = await updateRun(runId, {
        status: "success",
        sent_count: 0,
        error_count: 0,
        completed_at: new Date().toISOString(),
        error_message: null,
      });

      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason,
          data: {
            run: finalized,
          },
        },
        {
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const emailTemplate = buildDailyNotificationTemplate(
      runDateLabel,
      events,
      emailLogoUrl
    );
    const deliveries: DeliveryPayload[] = [];
    let sentCount = 0;
    let errorCount = 0;
    const sendErrors: string[] = [];

    for (const recipient of recipients) {
      try {
        const result = await sendBrevoTransactionalEmail({
          to: [{ email: recipient.email }],
          subject: emailTemplate.subject,
          htmlContent: emailTemplate.htmlContent,
          textContent: emailTemplate.textContent,
        });

        sentCount += 1;
        deliveries.push({
          run_id: runId,
          recipient_email: recipient.email,
          status: "sent",
          provider: "brevo",
          provider_message_id: result.messageId,
          error_message: null,
        });
      } catch (caught) {
        errorCount += 1;
        const detail =
          caught instanceof Error
            ? caught.message
            : "Error desconocido al enviar con Brevo.";
        sendErrors.push(`${recipient.email}: ${detail}`);
        deliveries.push({
          run_id: runId,
          recipient_email: recipient.email,
          status: "error",
          provider: "brevo",
          provider_message_id: null,
          error_message: detail,
        });
      }
    }

    let deliveryLogError: string | null = null;
    try {
      await insertDeliveries(deliveries);
    } catch (caught) {
      deliveryLogError =
        caught instanceof Error
          ? caught.message
          : "No se pudieron registrar los deliveries.";
    }

    let status: RunStatus =
      errorCount === 0 ? "success" : sentCount === 0 ? "error" : "partial";
    const errorMessageParts: string[] = [];

    if (sendErrors.length > 0) {
      errorMessageParts.push(sendErrors.slice(0, 5).join(" | "));
    }

    if (deliveryLogError) {
      errorMessageParts.push(deliveryLogError);
      if (status === "success") {
        status = "partial";
      }
    }

    const finalizedRun = await updateRun(runId, {
      status,
      sent_count: sentCount,
      error_count: errorCount,
      completed_at: new Date().toISOString(),
      error_message:
        errorMessageParts.length > 0 ? errorMessageParts.join(" || ") : null,
    });

    return NextResponse.json(
      {
        ok: true,
        skipped: false,
        forced: forceRun,
        data: {
          run: finalizedRun,
          recipients: {
            total: recipients.length,
            sent: sentCount,
            errors: errorCount,
          },
          events: {
            total: events.length,
            date: runDateIso,
            timezone: timeZone,
          },
        },
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    const message = formatRouteError(
      caught,
      "Error inesperado al ejecutar el envio diario."
    );

    if (createdRunId) {
      try {
        await updateRun(createdRunId, {
          status: "error",
          completed_at: new Date().toISOString(),
          error_message: message,
        });
      } catch {
        // No-op: intentamos registrar el error pero no bloqueamos la respuesta.
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
