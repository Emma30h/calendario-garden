type SupabaseErrorPayload = {
  message?: unknown;
  error?: unknown;
  hint?: unknown;
  details?: unknown;
};

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

function readEnvVar(name: string) {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim();
}

function getSupabaseConfig() {
  const rawBaseUrl =
    readEnvVar("SUPABASE_URL") || readEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const apiKey = readEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  if (!rawBaseUrl) {
    throw new SupabaseConfigError(
      "Falta SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  if (!apiKey) {
    throw new SupabaseConfigError(
      "Falta SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return {
    baseUrl: rawBaseUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

export async function supabaseRestFetch(path: string, init: RequestInit = {}) {
  const { baseUrl, apiKey } = getSupabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", apiKey);
  headers.set("Authorization", `Bearer ${apiKey}`);

  return fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function readSupabaseErrorMessage(
  response: Response,
  fallbackMessage: string
) {
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) {
        return text;
      }
    } catch {
      return fallbackMessage;
    }

    return fallbackMessage;
  }

  if (typeof payload !== "object" || payload === null) {
    return fallbackMessage;
  }

  const parsed = payload as SupabaseErrorPayload;
  const message =
    typeof parsed.message === "string"
      ? parsed.message
      : typeof parsed.error === "string"
        ? parsed.error
        : "";
  const hint = typeof parsed.hint === "string" ? parsed.hint : "";
  const details = typeof parsed.details === "string" ? parsed.details : "";

  const parts = [message, details, hint].filter((part) => part.length > 0);
  if (parts.length === 0) {
    return fallbackMessage;
  }

  return parts.join(" | ");
}
