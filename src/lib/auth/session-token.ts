import { APP_ROLES, type AppRole } from "@/lib/auth/types";

export type SessionTokenPayload = {
  v: 1;
  uid: string;
  email: string;
  role: AppRole;
  exp: number;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const ROLE_SET = new Set<AppRole>(APP_ROLES);

function toBase64(bytes: Uint8Array) {
  if (typeof btoa !== "function") {
    throw new Error("btoa is not available in this runtime.");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(base64: string) {
  if (typeof atob !== "function") {
    throw new Error("atob is not available in this runtime.");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array) {
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(raw: string) {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return fromBase64(`${normalized}${padding}`);
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payloadPart: string, secret: string) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payloadPart)
  );
  return encodeBase64Url(new Uint8Array(signature));
}

function normalizeTokenPayload(value: unknown): SessionTokenPayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const parsed = value as {
    v?: unknown;
    uid?: unknown;
    email?: unknown;
    role?: unknown;
    exp?: unknown;
  };

  if (parsed.v !== 1) {
    return null;
  }

  if (
    typeof parsed.uid !== "string" ||
    typeof parsed.email !== "string" ||
    typeof parsed.exp !== "number" ||
    !Number.isFinite(parsed.exp) ||
    !Number.isInteger(parsed.exp)
  ) {
    return null;
  }

  if (typeof parsed.role !== "string" || !ROLE_SET.has(parsed.role as AppRole)) {
    return null;
  }

  return {
    v: 1,
    uid: parsed.uid,
    email: parsed.email,
    role: parsed.role as AppRole,
    exp: parsed.exp,
  };
}

export async function createSessionToken(
  payload: SessionTokenPayload,
  secret: string
) {
  const payloadPart = encodeBase64Url(
    textEncoder.encode(JSON.stringify(payload))
  );
  const signaturePart = await signPayload(payloadPart, secret);
  return `${payloadPart}.${signaturePart}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionTokenPayload | null> {
  const split = token.split(".");
  if (split.length !== 2) {
    return null;
  }

  const [payloadPart, signaturePart] = split;
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = await signPayload(payloadPart, secret);
  if (expectedSignature !== signaturePart) {
    return null;
  }

  try {
    const decoded = textDecoder.decode(decodeBase64Url(payloadPart));
    const payload = normalizeTokenPayload(JSON.parse(decoded));
    if (!payload) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
