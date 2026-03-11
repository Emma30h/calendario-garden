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

const EMAIL_RECIPIENT_SELECT = "id,email,is_active,created_at";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type EmailRecipientResponse = {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

type EmailInsertPayload = {
  email: string;
};

type EmailPatchPayload = {
  email?: string;
  is_active?: boolean;
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

function normalizeEmail(value: string) {
  return value.toLowerCase();
}

function parseEmail(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  const normalized = normalizeEmail(parsed);
  if (normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeEmailRecipientRow(row: unknown): EmailRecipientResponse | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const email = parseEmail(parsed.email);
  const createdAt =
    asNonEmptyString(parsed.created_at) ?? asNonEmptyString(parsed.createdAt);
  const rawIsActive =
    typeof parsed.is_active === "boolean"
      ? parsed.is_active
      : typeof parsed.isActive === "boolean"
        ? parsed.isActive
        : null;

  if (!id || !email || !createdAt || rawIsActive === null) {
    return null;
  }

  return {
    id,
    email,
    isActive: rawIsActive,
    createdAt,
  };
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

function listPath() {
  const params = new URLSearchParams();
  params.set("select", EMAIL_RECIPIENT_SELECT);
  params.set("order", "created_at.desc");
  return `email_recipients?${params.toString()}`;
}

function insertPath() {
  const params = new URLSearchParams();
  params.set("select", EMAIL_RECIPIENT_SELECT);
  return `email_recipients?${params.toString()}`;
}

function updatePath(id: string) {
  const params = new URLSearchParams();
  params.set("id", `eq.${id}`);
  params.set("select", EMAIL_RECIPIENT_SELECT);
  return `email_recipients?${params.toString()}`;
}

function duplicateLookupPath(email: string, excludedId?: string) {
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("limit", "1");
  params.set("email", `eq.${email}`);
  if (excludedId) {
    params.set("id", `neq.${excludedId}`);
  }
  return `email_recipients?${params.toString()}`;
}

function parseInsertPayload(
  body: unknown
): { payload: EmailInsertPayload } | { error: string } {
  const parsed = asRecord(body);
  if (!parsed) {
    return { error: "Cuerpo de solicitud invalido." };
  }

  const email = parseEmail(parsed.email);
  if (!email) {
    return { error: "Debes ingresar un e-mail valido." };
  }

  return {
    payload: {
      email,
    },
  };
}

function parsePatchPayload(
  body: unknown
): { payload: EmailPatchPayload } | { error: string } {
  const parsed = asRecord(body);
  if (!parsed) {
    return { error: "Cuerpo de solicitud invalido." };
  }

  const hasEmail = Object.prototype.hasOwnProperty.call(parsed, "email");
  const hasIsActiveCamel = Object.prototype.hasOwnProperty.call(
    parsed,
    "isActive"
  );
  const hasIsActiveSnake = Object.prototype.hasOwnProperty.call(
    parsed,
    "is_active"
  );
  const hasIsActive = hasIsActiveCamel || hasIsActiveSnake;

  if (!hasEmail && !hasIsActive) {
    return { error: "Debes enviar al menos un campo para actualizar." };
  }

  const payload: EmailPatchPayload = {};

  if (hasEmail) {
    const email = parseEmail(parsed.email);
    if (!email) {
      return { error: "El e-mail enviado no es valido." };
    }
    payload.email = email;
  }

  if (hasIsActive) {
    const rawIsActive = hasIsActiveCamel ? parsed.isActive : parsed.is_active;
    if (typeof rawIsActive !== "boolean") {
      return { error: "El estado de actividad debe ser booleano." };
    }
    payload.is_active = rawIsActive;
  }

  return { payload };
}

export async function GET(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const response = await supabaseRestFetch(listPath());

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudieron consultar los e-mails."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const body = (await response.json()) as unknown;
    const rows = Array.isArray(body) ? body : [];
    const normalized = rows
      .map((row) => normalizeEmailRecipientRow(row))
      .filter((row): row is EmailRecipientResponse => row !== null);

    return NextResponse.json(
      { data: normalized },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al consultar e-mails."
        ),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json()) as unknown;
    const parsed = parseInsertPayload(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const duplicateLookupResponse = await supabaseRestFetch(
      duplicateLookupPath(parsed.payload.email)
    );

    if (!duplicateLookupResponse.ok) {
      const message = await readSupabaseErrorMessage(
        duplicateLookupResponse,
        "No se pudo validar si el e-mail ya existe."
      );
      return NextResponse.json(
        { error: message },
        { status: duplicateLookupResponse.status }
      );
    }

    const duplicateRows = (await duplicateLookupResponse.json()) as unknown;
    const alreadyExists =
      Array.isArray(duplicateRows) && duplicateRows.length > 0;

    if (alreadyExists) {
      return NextResponse.json(
        { error: "El e-mail ya esta cargado." },
        { status: 409 }
      );
    }

    const response = await supabaseRestFetch(insertPath(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(parsed.payload),
    });

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo guardar el e-mail."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const insertedRows = (await response.json()) as unknown;
    const firstInserted =
      Array.isArray(insertedRows) && insertedRows.length > 0
        ? normalizeEmailRecipientRow(insertedRows[0])
        : null;

    if (!firstInserted) {
      return NextResponse.json(
        { error: "El servidor no devolvio un registro valido." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { data: firstInserted },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(caught, "Error inesperado al guardar e-mail."),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = asNonEmptyString(searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "Debes indicar el ID del e-mail a actualizar." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as unknown;
    const parsed = parsePatchPayload(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    if (parsed.payload.email) {
      const duplicateLookupResponse = await supabaseRestFetch(
        duplicateLookupPath(parsed.payload.email, id)
      );

      if (!duplicateLookupResponse.ok) {
        const message = await readSupabaseErrorMessage(
          duplicateLookupResponse,
          "No se pudo validar si el e-mail ya existe."
        );
        return NextResponse.json(
          { error: message },
          { status: duplicateLookupResponse.status }
        );
      }

      const duplicateRows = (await duplicateLookupResponse.json()) as unknown;
      const alreadyExists =
        Array.isArray(duplicateRows) && duplicateRows.length > 0;

      if (alreadyExists) {
        return NextResponse.json(
          { error: "El e-mail ya esta cargado en otro registro." },
          { status: 409 }
        );
      }
    }

    const response = await supabaseRestFetch(updatePath(id), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(parsed.payload),
    });

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo actualizar el e-mail."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const updatedRows = (await response.json()) as unknown;
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "No se encontro el e-mail a actualizar." },
        { status: 404 }
      );
    }

    const firstUpdated = normalizeEmailRecipientRow(updatedRows[0]);
    if (!firstUpdated) {
      return NextResponse.json(
        { error: "El servidor no devolvio un registro actualizado valido." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { data: firstUpdated },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al actualizar e-mail."
        ),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = asNonEmptyString(searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "Debes indicar el ID del e-mail a eliminar." },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.set("id", `eq.${id}`);

    const response = await supabaseRestFetch(
      `email_recipients?${params.toString()}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      }
    );

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo eliminar el e-mail."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(caught, "Error inesperado al eliminar e-mail."),
      },
      { status: 500 }
    );
  }
}
