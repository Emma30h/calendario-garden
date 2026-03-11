import { NextResponse } from "next/server";
import { requireRoleSession } from "@/lib/auth/server-auth";
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type ParsedTestEmailBody = {
  recipientId: string | null;
  email: string | null;
};

type ResolveRecipientResult =
  | {
      email: string;
    }
  | {
      error: string;
      status: number;
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

function parseEmail(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  const normalized = parsed.toLowerCase();
  if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseBody(
  body: unknown
): { payload: ParsedTestEmailBody } | { error: string } {
  const parsed = asRecord(body);
  if (!parsed) {
    return { error: "Cuerpo de solicitud invalido." };
  }

  const recipientId = asNonEmptyString(parsed.recipientId);
  const email = parseEmail(parsed.email);

  if (!recipientId && !email) {
    return { error: "Debes enviar recipientId o email." };
  }

  return {
    payload: {
      recipientId,
      email,
    },
  };
}

function recipientLookupPath(recipientId: string) {
  const params = new URLSearchParams();
  params.set("select", "id,email,is_active");
  params.set("id", `eq.${recipientId}`);
  params.set("limit", "1");
  return `email_recipients?${params.toString()}`;
}

async function resolveRecipientEmail(recipientId: string): Promise<ResolveRecipientResult> {
  const response = await supabaseRestFetch(recipientLookupPath(recipientId));

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo consultar el destinatario."
    );
    return {
      error: message,
      status: response.status,
    };
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];

  if (rows.length === 0) {
    return {
      error: "No se encontro el destinatario seleccionado.",
      status: 404,
    };
  }

  const row = asRecord(rows[0]);
  const email = parseEmail(row?.email);
  const isActive = row?.is_active;

  if (!email) {
    return {
      error: "El destinatario no tiene un e-mail valido.",
      status: 409,
    };
  }

  if (typeof isActive !== "boolean" || !isActive) {
    return {
      error: "El destinatario esta pausado. Activalo antes de enviar prueba.",
      status: 409,
    };
  }

  return {
    email,
  };
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

function buildTestEmailTemplate(targetEmail: string) {
  const now = new Date();
  const nowLabel = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);

  const subject = "Prueba de notificacion diaria - Calendario Garden";
  const textContent = [
    "Hola,",
    "",
    "Este es un e-mail de prueba del modulo de notificaciones de Calendario Garden.",
    `Fecha y hora de envio: ${nowLabel}.`,
    `Destinatario de prueba: ${targetEmail}.`,
    "",
    "Si recibiste este e-mail, la integracion con Brevo funciona correctamente.",
  ].join("\n");

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; color: #1b1b1b; line-height: 1.5;">
      <h2 style="margin: 0 0 12px; color: #22331d;">Prueba de notificacion diaria</h2>
      <p style="margin: 0 0 8px;">Este es un e-mail de prueba del modulo de notificaciones de Calendario Garden.</p>
      <p style="margin: 0 0 8px;"><strong>Fecha y hora:</strong> ${nowLabel}</p>
      <p style="margin: 0 0 8px;"><strong>Destinatario:</strong> ${targetEmail}</p>
      <p style="margin: 16px 0 0;">Si recibiste este e-mail, la integracion con Brevo funciona correctamente.</p>
    </div>
  `;

  return {
    subject,
    textContent,
    htmlContent,
  };
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json()) as unknown;
    const parsed = parseBody(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const recipientLookup = parsed.payload.email
      ? { email: parsed.payload.email }
      : parsed.payload.recipientId
        ? await resolveRecipientEmail(parsed.payload.recipientId)
        : null;

    if (recipientLookup === null) {
      return NextResponse.json(
        { error: "No se pudo resolver el destinatario de prueba." },
        { status: 400 }
      );
    }

    if ("error" in recipientLookup) {
      return NextResponse.json(
        { error: recipientLookup.error },
        { status: recipientLookup.status }
      );
    }

    const targetEmail = recipientLookup.email;

    const template = buildTestEmailTemplate(targetEmail);
    const result = await sendBrevoTransactionalEmail({
      to: [{ email: targetEmail }],
      subject: template.subject,
      htmlContent: template.htmlContent,
      textContent: template.textContent,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          recipientEmail: targetEmail,
          messageId: result.messageId,
        },
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al enviar e-mail de prueba."
        ),
      },
      { status: 500 }
    );
  }
}
