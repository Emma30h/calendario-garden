type BrevoErrorPayload = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
};

export class BrevoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrevoConfigError";
  }
}

type BrevoAddress = {
  email: string;
  name?: string;
};

type SendBrevoTransactionalEmailOptions = {
  to: BrevoAddress[];
  subject: string;
  htmlContent: string;
  textContent?: string;
};

type SendBrevoTransactionalEmailResult = {
  messageId: string | null;
};

function readEnvVar(name: string) {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim();
}

function getBrevoConfig() {
  const apiKey = readEnvVar("BREVO_API_KEY");
  const senderEmail = readEnvVar("BREVO_SENDER_EMAIL");
  const senderName = readEnvVar("BREVO_SENDER_NAME") || "Calendario Garden";

  if (!apiKey) {
    throw new BrevoConfigError("Falta BREVO_API_KEY.");
  }

  if (!senderEmail) {
    throw new BrevoConfigError("Falta BREVO_SENDER_EMAIL.");
  }

  return {
    apiKey,
    senderEmail,
    senderName,
  };
}

export async function readBrevoErrorMessage(
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

  const parsed = payload as BrevoErrorPayload;
  const message =
    typeof parsed.message === "string"
      ? parsed.message
      : typeof parsed.code === "string"
        ? parsed.code
        : "";
  const details = typeof parsed.details === "string" ? parsed.details : "";
  const parts = [message, details].filter((part) => part.length > 0);

  return parts.length > 0 ? parts.join(" | ") : fallbackMessage;
}

export async function sendBrevoTransactionalEmail(
  options: SendBrevoTransactionalEmailOptions
): Promise<SendBrevoTransactionalEmailResult> {
  const config = getBrevoConfig();

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      sender: {
        email: config.senderEmail,
        name: config.senderName,
      },
      to: options.to,
      subject: options.subject,
      htmlContent: options.htmlContent,
      textContent: options.textContent,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await readBrevoErrorMessage(
      response,
      "Brevo no pudo enviar el e-mail."
    );
    throw new Error(message);
  }

  const payload = (await response.json()) as { messageId?: unknown };
  return {
    messageId: typeof payload.messageId === "string" ? payload.messageId : null,
  };
}
