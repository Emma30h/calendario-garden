import "server-only";

import { compare, hash } from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AUTH_CLIENT_MODE_RETURN_COOKIE_NAME,
  AUTH_LOGIN_MAX_ATTEMPTS,
  AUTH_LOGIN_WINDOW_MINUTES,
  AUTH_OTP_MAX_ATTEMPTS,
  AUTH_OTP_RESEND_COOLDOWN_SECONDS,
  AUTH_OTP_TTL_MINUTES,
  AUTH_OTP_WINDOW_MAX_SENDS,
  AUTH_OTP_WINDOW_MINUTES,
  AUTH_PASSWORD_SALT_ROUNDS,
  AUTH_SESSION_TTL_SECONDS,
} from "@/lib/auth/constants";
import { buildPermissionsForRole } from "@/lib/auth/permissions";
import {
  createSessionToken,
  verifySessionToken,
  type SessionTokenPayload,
} from "@/lib/auth/session-token";
import { APP_USER_STATUSES, type AppRole, type AppUserStatus, type AuthSessionUser } from "@/lib/auth/types";
import { BrevoConfigError, sendBrevoTransactionalEmail } from "@/lib/brevo";
import {
  readSupabaseErrorMessage,
  SupabaseConfigError,
  supabaseRestFetch,
} from "@/lib/supabase-rest";

type InternalUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  status: AppUserStatus;
};

type SignupProfileInput = {
  firstName: string;
  lastName: string;
  personalType: "Oficial" | "Suboficial" | "Tecnico" | "Civil";
  hierarchy: string | null;
  area: string;
};

type InternalAdminUserRow = {
  id: string;
  email: string;
  status: AppUserStatus;
  firstName: string | null;
  lastName: string | null;
  personalType: string | null;
  hierarchy: string | null;
  area: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

type InternalUserRoleRow = {
  userId: string;
  role: AppRole;
  createdAt: string;
};

type InternalOtpCodeRow = {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  lastSentAt: string;
  createdAt: string;
};

type AuditAction =
  | "auth.login.failed"
  | "auth.login.success"
  | "auth.bootstrap.created"
  | "auth.signup.created"
  | "auth.admin_user.created"
  | "auth.otp.sent"
  | "auth.otp.verified"
  | "auth.password_reset.requested"
  | "auth.password_reset.completed"
  | "auth.password_changed";

type SessionReadResult = {
  user: AuthSessionUser;
  exp: number;
};

type SessionUserProfile = {
  firstName: string | null;
  lastName: string | null;
  hierarchy: string | null;
  personalType: string | null;
};

type SessionViewUser = AuthSessionUser & SessionUserProfile;

export type SessionView = {
  authenticated: boolean;
  user: SessionViewUser | null;
  permissions: ReturnType<typeof buildPermissionsForRole> | null;
  canExitClientMode: boolean;
};

export type AdminUserSummary = {
  id: string;
  email: string;
  role: AppRole | null;
  status: AppUserStatus;
  firstName: string | null;
  lastName: string | null;
  personalType: string | null;
  hierarchy: string | null;
  area: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

type OtpDispatchResult = {
  delivery: "email" | "dev";
  expiresAt: string;
  devCode?: string;
};

type OtpStorageTable = "email_verification_codes" | "password_reset_codes";

const GUEST_CLIENT_UID = "guest-client-public";
const GUEST_CLIENT_EMAIL = "cliente.invitado@calendario.garden";

export class AuthOperationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthOperationError";
    this.status = status;
    this.code = code;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeInputText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function uppercaseFirstCharacter(value: string) {
  const [firstCharacter = "", ...restCharacters] = Array.from(value);
  if (!firstCharacter) {
    return "";
  }

  return `${firstCharacter.toLocaleUpperCase("es-AR")}${restCharacters.join("")}`;
}

function normalizePersonName(value: string) {
  const normalized = normalizeInputText(value).toLocaleLowerCase("es-AR");
  if (!normalized) {
    return normalized;
  }

  return normalized
    .split(" ")
    .map((word) =>
      word
        .split(/([-'])/u)
        .map((segment) => {
          if (segment === "-" || segment === "'") {
            return segment;
          }

          return uppercaseFirstCharacter(segment);
        })
        .join("")
    )
    .join(" ");
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

function asIsoTimestamp(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  return Number.isNaN(new Date(parsed).getTime()) ? null : parsed;
}

function asUserStatus(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  return APP_USER_STATUSES.includes(parsed as AppUserStatus)
    ? (parsed as AppUserStatus)
    : null;
}

function asRole(value: unknown): AppRole | null {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  if (parsed === "ADMIN" || parsed === "CLIENTE") {
    return parsed;
  }

  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeUserRow(row: unknown): InternalUserRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const email = asNonEmptyString(parsed.email);
  const passwordHash =
    asNonEmptyString(parsed.password_hash) ?? asNonEmptyString(parsed.passwordHash);
  const status = asUserStatus(parsed.status);

  if (!id || !email || !passwordHash || !status) {
    return null;
  }

  return {
    id,
    email: email.toLowerCase(),
    passwordHash,
    status,
  };
}

function normalizeSessionUserProfileRow(row: unknown): SessionUserProfile {
  const parsed = asRecord(row);

  return {
    firstName:
      asNonEmptyString(parsed?.first_name) ??
      asNonEmptyString(parsed?.firstName) ??
      null,
    lastName:
      asNonEmptyString(parsed?.last_name) ??
      asNonEmptyString(parsed?.lastName) ??
      null,
    hierarchy: asNonEmptyString(parsed?.hierarchy) ?? null,
    personalType:
      asNonEmptyString(parsed?.personal_type) ??
      asNonEmptyString(parsed?.personalType) ??
      null,
  };
}

function normalizeAdminUserRow(row: unknown): InternalAdminUserRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const email = asNonEmptyString(parsed.email);
  const status = asUserStatus(parsed.status);
  const createdAt =
    asIsoTimestamp(parsed.created_at) ?? asIsoTimestamp(parsed.createdAt);
  const lastLoginAt =
    asIsoTimestamp(parsed.last_login_at) ?? asIsoTimestamp(parsed.lastLoginAt);

  if (!id || !email || !status || !createdAt) {
    return null;
  }

  return {
    id,
    email: email.toLowerCase(),
    status,
    firstName:
      asNonEmptyString(parsed.first_name) ?? asNonEmptyString(parsed.firstName),
    lastName:
      asNonEmptyString(parsed.last_name) ?? asNonEmptyString(parsed.lastName),
    personalType:
      asNonEmptyString(parsed.personal_type) ??
      asNonEmptyString(parsed.personalType),
    hierarchy: asNonEmptyString(parsed.hierarchy),
    area: asNonEmptyString(parsed.area),
    createdAt,
    lastLoginAt: lastLoginAt ?? null,
  };
}

function normalizeUserRoleRow(row: unknown): InternalUserRoleRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const userId = asNonEmptyString(parsed.user_id) ?? asNonEmptyString(parsed.userId);
  const role = asRole(parsed.role);
  const createdAt =
    asIsoTimestamp(parsed.created_at) ?? asIsoTimestamp(parsed.createdAt);

  if (!userId || !role || !createdAt) {
    return null;
  }

  return {
    userId,
    role,
    createdAt,
  };
}

function normalizeOtpCodeRow(row: unknown): InternalOtpCodeRow | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const userId = asNonEmptyString(parsed.user_id) ?? asNonEmptyString(parsed.userId);
  const codeHash =
    asNonEmptyString(parsed.code_hash) ?? asNonEmptyString(parsed.codeHash);
  const expiresAt =
    asIsoTimestamp(parsed.expires_at) ?? asIsoTimestamp(parsed.expiresAt);
  const attempts = asNonNegativeInteger(parsed.attempts);
  const consumedAt =
    asIsoTimestamp(parsed.consumed_at) ?? asIsoTimestamp(parsed.consumedAt);
  const lastSentAt =
    asIsoTimestamp(parsed.last_sent_at) ?? asIsoTimestamp(parsed.lastSentAt);
  const createdAt =
    asIsoTimestamp(parsed.created_at) ?? asIsoTimestamp(parsed.createdAt);

  if (!id || !userId || !codeHash || !expiresAt || attempts === null || !lastSentAt || !createdAt) {
    return null;
  }

  return {
    id,
    userId,
    codeHash,
    expiresAt,
    attempts,
    consumedAt: consumedAt ?? null,
    lastSentAt,
    createdAt,
  };
}

function parseCookieValue(header: string | null, name: string) {
  if (!header) {
    return null;
  }

  const parts = header.split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    const rawValue = rest.join("=");
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function getSessionSecret() {
  const raw = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (!raw || raw.length < 32) {
    throw new AuthOperationError(
      "Falta AUTH_SESSION_SECRET o tiene menos de 32 caracteres.",
      500,
      "AUTH_CONFIG_MISSING"
    );
  }

  return raw;
}

function getOtpPepper() {
  return process.env.AUTH_OTP_PEPPER?.trim() ?? "";
}

function isDevOtpFallbackEnabled() {
  const raw = process.env.AUTH_ALLOW_DEV_OTP_FALLBACK?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes";
}

function hashOtpCode(code: string) {
  const pepper = getOtpPepper();
  return createHash("sha256")
    .update(`${code}.${pepper}`)
    .digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1_000);
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function buildSessionUser(id: string, email: string, role: AppRole): AuthSessionUser {
  return {
    id,
    email,
    role,
  };
}

function buildApiError(error: unknown, fallback: string) {
  if (error instanceof AuthOperationError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
      },
    };
  }

  if (error instanceof SupabaseConfigError || error instanceof BrevoConfigError) {
    return {
      status: 500,
      body: {
        error: error.message,
      },
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      body: {
        error: error.message,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: fallback,
    },
  };
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    return first || null;
  }

  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  return realIp || null;
}

async function fetchOneRoleByUserId(userId: string): Promise<AppRole | null> {
  const params = new URLSearchParams();
  params.set("select", "role");
  params.set("user_id", `eq.${userId}`);
  params.set("limit", "1");
  params.set("order", "created_at.asc");

  const response = await supabaseRestFetch(`user_roles?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo consultar el rol de usuario."
    );
    throw new AuthOperationError(message, response.status, "ROLE_LOOKUP_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) {
    return null;
  }

  const parsed = asRecord(rows[0]);
  return asRole(parsed?.role);
}

async function fetchSessionUserProfileById(
  userId: string
): Promise<SessionUserProfile | null> {
  if (!isUuid(userId)) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("select", "first_name,last_name,hierarchy,personal_type");
  params.set("id", `eq.${userId}`);
  params.set("limit", "1");

  const response = await supabaseRestFetch(`users?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) {
    return null;
  }

  return normalizeSessionUserProfileRow(rows[0]);
}

async function fetchUserByEmail(email: string): Promise<InternalUserRow | null> {
  const params = new URLSearchParams();
  params.set("select", "id,email,password_hash,status");
  params.set("email", `eq.${email}`);
  params.set("limit", "1");

  const response = await supabaseRestFetch(`users?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo consultar el usuario."
    );
    throw new AuthOperationError(message, response.status, "USER_LOOKUP_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) {
    return null;
  }

  return normalizeUserRow(rows[0]);
}

async function fetchUserById(userId: string): Promise<InternalUserRow | null> {
  if (!isUuid(userId)) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("select", "id,email,password_hash,status");
  params.set("id", `eq.${userId}`);
  params.set("limit", "1");

  const response = await supabaseRestFetch(`users?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo consultar el usuario autenticado."
    );
    throw new AuthOperationError(message, response.status, "USER_LOOKUP_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) {
    return null;
  }

  return normalizeUserRow(rows[0]);
}

async function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  const userParams = new URLSearchParams();
  userParams.set(
    "select",
    "id,email,status,first_name,last_name,personal_type,hierarchy,area,created_at,last_login_at"
  );
  userParams.set("order", "created_at.desc");
  userParams.set("limit", "200");

  const userResponse = await supabaseRestFetch(`users?${userParams.toString()}`);
  if (!userResponse.ok) {
    const message = await readSupabaseErrorMessage(
      userResponse,
      "No se pudo consultar el listado de usuarios."
    );
    throw new AuthOperationError(message, userResponse.status, "USER_LIST_LOOKUP_FAILED");
  }

  const userBody = (await userResponse.json()) as unknown;
  const userRows = Array.isArray(userBody) ? userBody : [];
  const users = userRows
    .map((row) => normalizeAdminUserRow(row))
    .filter((row): row is InternalAdminUserRow => row !== null);

  const roleParams = new URLSearchParams();
  roleParams.set("select", "user_id,role,created_at");
  roleParams.set("client_id", "is.null");
  roleParams.set("order", "created_at.desc");
  roleParams.set("limit", "500");

  const roleResponse = await supabaseRestFetch(`user_roles?${roleParams.toString()}`);
  if (!roleResponse.ok) {
    const message = await readSupabaseErrorMessage(
      roleResponse,
      "No se pudo consultar roles de usuarios."
    );
    throw new AuthOperationError(message, roleResponse.status, "ROLE_LIST_LOOKUP_FAILED");
  }

  const roleBody = (await roleResponse.json()) as unknown;
  const roleRows = Array.isArray(roleBody) ? roleBody : [];
  const roleByUserId = new Map<string, AppRole>();
  for (const row of roleRows) {
    const parsed = normalizeUserRoleRow(row);
    if (!parsed || roleByUserId.has(parsed.userId)) {
      continue;
    }

    roleByUserId.set(parsed.userId, parsed.role);
  }

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    role: roleByUserId.get(user.id) ?? null,
    status: user.status,
    firstName: user.firstName,
    lastName: user.lastName,
    personalType: user.personalType,
    hierarchy: user.hierarchy,
    area: user.area,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }));
}

async function hasAnyUser() {
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("limit", "1");

  const response = await supabaseRestFetch(`users?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo validar bootstrap inicial."
    );
    throw new AuthOperationError(message, response.status, "BOOTSTRAP_LOOKUP_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows.length > 0;
}

async function isOnlyRegisteredUser(userId: string) {
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("order", "created_at.asc");
  params.set("limit", "2");

  const response = await supabaseRestFetch(`users?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo validar usuarios registrados."
    );
    throw new AuthOperationError(message, response.status, "USER_COUNT_LOOKUP_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length !== 1) {
    return false;
  }

  const parsed = asRecord(rows[0]);
  const onlyUserId = asNonEmptyString(parsed?.id);
  return onlyUserId === userId;
}

async function resolveUserRoleWithBootstrapRecovery(
  user: InternalUserRow
): Promise<AppRole | null> {
  const currentRole = await fetchOneRoleByUserId(user.id);
  if (currentRole) {
    return currentRole;
  }

  const canRecoverAsBootstrapAdmin = await isOnlyRegisteredUser(user.id);
  if (!canRecoverAsBootstrapAdmin) {
    return null;
  }

  try {
    await insertUserRole(user.id, "ADMIN");
  } catch (error) {
    if (!(error instanceof AuthOperationError) || error.status !== 409) {
      throw error;
    }
  }

  return fetchOneRoleByUserId(user.id);
}

async function insertUser(
  email: string,
  passwordHash: string,
  profile: SignupProfileInput
) {
  const params = new URLSearchParams();
  params.set("select", "id,email,password_hash,status");

  const response = await supabaseRestFetch(`users?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      email,
      password_hash: passwordHash,
      status: "pending_verification",
      first_name: profile.firstName,
      last_name: profile.lastName,
      personal_type: profile.personalType,
      hierarchy: profile.hierarchy,
      area: profile.area,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo crear el usuario."
    );
    throw new AuthOperationError(message, response.status, "USER_CREATE_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  const first = rows.map((row) => normalizeUserRow(row)).find((row) => row !== null) ?? null;
  if (!first) {
    throw new AuthOperationError(
      "No se pudo interpretar el usuario creado.",
      502,
      "USER_CREATE_INVALID_RESPONSE"
    );
  }

  return first;
}

async function insertUserRole(userId: string, role: AppRole) {
  const response = await supabaseRestFetch("user_roles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      role,
      client_id: null,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo asignar el rol al usuario."
    );
    throw new AuthOperationError(message, response.status, "USER_ROLE_CREATE_FAILED");
  }
}

async function updateUserStatus(userId: string, status: AppUserStatus) {
  const params = new URLSearchParams();
  params.set("id", `eq.${userId}`);
  params.set("select", "id");

  const response = await supabaseRestFetch(`users?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      status,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo actualizar el estado del usuario."
    );
    throw new AuthOperationError(message, response.status, "USER_STATUS_UPDATE_FAILED");
  }
}

async function updateUserPasswordHash(userId: string, passwordHash: string) {
  const params = new URLSearchParams();
  params.set("id", `eq.${userId}`);
  params.set("select", "id");

  const response = await supabaseRestFetch(`users?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      password_hash: passwordHash,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo actualizar la contrasena del usuario."
    );
    throw new AuthOperationError(
      message,
      response.status,
      "USER_PASSWORD_UPDATE_FAILED"
    );
  }
}

async function updateUserLastLogin(userId: string) {
  const params = new URLSearchParams();
  params.set("id", `eq.${userId}`);
  params.set("select", "id");

  const response = await supabaseRestFetch(`users?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      last_login_at: nowIso(),
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo registrar ultimo login."
    );
    throw new AuthOperationError(message, response.status, "USER_LAST_LOGIN_UPDATE_FAILED");
  }
}

async function insertAuditLog(
  request: Request,
  action: AuditAction,
  resource: string,
  userId?: string
) {
  const response = await supabaseRestFetch("audit_logs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId ?? null,
      action,
      resource,
      ip: getRequestIp(request),
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo registrar auditoria."
    );
    throw new AuthOperationError(message, response.status, "AUDIT_LOG_WRITE_FAILED");
  }
}

async function countAuditLogsSince(
  action: AuditAction,
  resource: string,
  sinceIso: string
) {
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("action", `eq.${action}`);
  params.set("resource", `eq.${resource}`);
  params.set("created_at", `gte.${sinceIso}`);
  params.set("limit", "100");

  const response = await supabaseRestFetch(`audit_logs?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo validar limite de intentos."
    );
    throw new AuthOperationError(message, response.status, "AUDIT_LOG_COUNT_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows.length;
}

async function fetchLatestOtpCodeFromTable(
  userId: string,
  table: OtpStorageTable
): Promise<InternalOtpCodeRow | null> {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,user_id,code_hash,expires_at,attempts,consumed_at,last_sent_at,created_at"
  );
  params.set("user_id", `eq.${userId}`);
  params.set("limit", "1");
  params.set("order", "created_at.desc");

  const response = await supabaseRestFetch(`${table}?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo consultar codigo OTP."
    );
    throw new AuthOperationError(message, response.status, "OTP_LOOKUP_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  if (rows.length === 0) {
    return null;
  }

  return normalizeOtpCodeRow(rows[0]);
}

async function countOtpSendsSinceFromTable(
  userId: string,
  sinceIso: string,
  table: OtpStorageTable
) {
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("user_id", `eq.${userId}`);
  params.set("created_at", `gte.${sinceIso}`);
  params.set("limit", "100");

  const response = await supabaseRestFetch(`${table}?${params.toString()}`);
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo validar limite de envios OTP."
    );
    throw new AuthOperationError(message, response.status, "OTP_SEND_COUNT_FAILED");
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows.length;
}

async function insertOtpCodeToTable(
  userId: string,
  codeHash: string,
  expiresAt: string,
  now: string,
  table: OtpStorageTable
) {
  const response = await supabaseRestFetch(table, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
      sent_count: 1,
      last_sent_at: now,
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo guardar codigo OTP."
    );
    throw new AuthOperationError(message, response.status, "OTP_INSERT_FAILED");
  }
}

async function updateOtpAttemptsInTable(
  codeId: string,
  attempts: number,
  table: OtpStorageTable
) {
  const params = new URLSearchParams();
  params.set("id", `eq.${codeId}`);
  params.set("select", "id");

  const response = await supabaseRestFetch(`${table}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ attempts }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo actualizar intentos OTP."
    );
    throw new AuthOperationError(
      message,
      response.status,
      "OTP_ATTEMPTS_UPDATE_FAILED"
    );
  }
}

async function consumeOtpCodeInTable(codeId: string, table: OtpStorageTable) {
  const params = new URLSearchParams();
  params.set("id", `eq.${codeId}`);
  params.set("select", "id");

  const response = await supabaseRestFetch(`${table}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      consumed_at: nowIso(),
    }),
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo consumir codigo OTP."
    );
    throw new AuthOperationError(message, response.status, "OTP_CONSUME_FAILED");
  }
}

async function fetchLatestOtpCode(userId: string) {
  return fetchLatestOtpCodeFromTable(userId, "email_verification_codes");
}

async function countOtpSendsSince(userId: string, sinceIso: string) {
  return countOtpSendsSinceFromTable(userId, sinceIso, "email_verification_codes");
}

async function insertOtpCode(
  userId: string,
  codeHash: string,
  expiresAt: string,
  now: string
) {
  return insertOtpCodeToTable(
    userId,
    codeHash,
    expiresAt,
    now,
    "email_verification_codes"
  );
}

async function updateOtpAttempts(codeId: string, attempts: number) {
  return updateOtpAttemptsInTable(codeId, attempts, "email_verification_codes");
}

async function consumeOtpCode(codeId: string) {
  return consumeOtpCodeInTable(codeId, "email_verification_codes");
}

async function fetchLatestPasswordResetCode(userId: string) {
  return fetchLatestOtpCodeFromTable(userId, "password_reset_codes");
}

async function countPasswordResetSendsSince(userId: string, sinceIso: string) {
  return countOtpSendsSinceFromTable(userId, sinceIso, "password_reset_codes");
}

async function insertPasswordResetCode(
  userId: string,
  codeHash: string,
  expiresAt: string,
  now: string
) {
  return insertOtpCodeToTable(
    userId,
    codeHash,
    expiresAt,
    now,
    "password_reset_codes"
  );
}

async function updatePasswordResetAttempts(codeId: string, attempts: number) {
  return updateOtpAttemptsInTable(codeId, attempts, "password_reset_codes");
}

async function consumePasswordResetCode(codeId: string) {
  return consumeOtpCodeInTable(codeId, "password_reset_codes");
}

function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendOtpByEmail(email: string, code: string, expiresAt: Date) {
  const expiresLabel = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(expiresAt);

  await sendBrevoTransactionalEmail({
    to: [{ email }],
    subject: "Codigo de verificacion - Calendario Garden",
    textContent: [
      "Tu codigo de verificacion es:",
      code,
      "",
      `Este codigo vence el ${expiresLabel}.`,
      "Si no solicitaste este acceso, ignora este mensaje.",
    ].join("\n"),
    htmlContent: `
      <div style="font-family: Arial, sans-serif; color: #1b1b1b; line-height: 1.5;">
        <h2 style="margin: 0 0 12px; color: #22331d;">Verificacion de e-mail</h2>
        <p style="margin: 0 0 8px;">Tu codigo de verificacion es:</p>
        <p style="margin: 0 0 10px; font-size: 28px; letter-spacing: 4px; font-weight: 700;">${code}</p>
        <p style="margin: 0 0 8px;">Este codigo vence el <strong>${expiresLabel}</strong>.</p>
        <p style="margin: 0;">Si no solicitaste este acceso, ignora este mensaje.</p>
      </div>
    `,
  });
}

async function sendPasswordResetOtpByEmail(
  email: string,
  code: string,
  expiresAt: Date
) {
  const expiresLabel = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(expiresAt);

  await sendBrevoTransactionalEmail({
    to: [{ email }],
    subject: "Codigo para cambiar tu contrasena - Calendario Garden",
    textContent: [
      "Recibimos una solicitud para cambiar tu contrasena.",
      "Codigo de recuperacion:",
      code,
      "",
      `Este codigo vence el ${expiresLabel}.`,
      "Si no solicitaste este cambio, ignora este mensaje.",
    ].join("\n"),
    htmlContent: `
      <div style="font-family: Arial, sans-serif; color: #1b1b1b; line-height: 1.5;">
        <h2 style="margin: 0 0 12px; color: #22331d;">Recuperacion de contrasena</h2>
        <p style="margin: 0 0 8px;">Recibimos una solicitud para cambiar tu contrasena.</p>
        <p style="margin: 0 0 8px;">Tu codigo de recuperacion es:</p>
        <p style="margin: 0 0 10px; font-size: 28px; letter-spacing: 4px; font-weight: 700;">${code}</p>
        <p style="margin: 0 0 8px;">Este codigo vence el <strong>${expiresLabel}</strong>.</p>
        <p style="margin: 0;">Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `,
  });
}

async function issueOtpForUser(user: InternalUserRow): Promise<OtpDispatchResult> {
  const now = new Date();
  const latestCode = await fetchLatestOtpCode(user.id);
  if (latestCode && !latestCode.consumedAt) {
    const cooldownUntil = addSeconds(
      new Date(latestCode.lastSentAt),
      AUTH_OTP_RESEND_COOLDOWN_SECONDS
    );
    if (cooldownUntil.getTime() > now.getTime()) {
      const remaining = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000);
      throw new AuthOperationError(
        `Debes esperar ${remaining} segundos para reenviar el codigo.`,
        429,
        "OTP_COOLDOWN"
      );
    }
  }

  const windowSince = addMinutes(now, -AUTH_OTP_WINDOW_MINUTES).toISOString();
  const sendCount = await countOtpSendsSince(user.id, windowSince);
  if (sendCount >= AUTH_OTP_WINDOW_MAX_SENDS) {
    throw new AuthOperationError(
      "Superaste el limite de reenvios de codigo. Intenta mas tarde.",
      429,
      "OTP_RATE_LIMIT"
    );
  }

  const otpCode = generateOtpCode();
  const otpHash = hashOtpCode(otpCode);
  const expiresAtDate = addMinutes(now, AUTH_OTP_TTL_MINUTES);
  const expiresAtIso = expiresAtDate.toISOString();
  const nowValue = now.toISOString();

  await insertOtpCode(user.id, otpHash, expiresAtIso, nowValue);

  try {
    await sendOtpByEmail(user.email, otpCode, expiresAtDate);
    return {
      delivery: "email",
      expiresAt: expiresAtIso,
    };
  } catch (error) {
    if (
      error instanceof BrevoConfigError &&
      process.env.NODE_ENV !== "production" &&
      isDevOtpFallbackEnabled()
    ) {
      return {
        delivery: "dev",
        expiresAt: expiresAtIso,
        devCode: otpCode,
      };
    }

    if (error instanceof Error) {
      throw new AuthOperationError(
        error.message,
        502,
        "OTP_SEND_FAILED"
      );
    }

    throw new AuthOperationError(
      "No se pudo enviar el codigo OTP.",
      502,
      "OTP_SEND_FAILED"
    );
  }
}

async function issuePasswordResetOtpForUser(
  user: InternalUserRow
): Promise<OtpDispatchResult> {
  const now = new Date();
  const latestCode = await fetchLatestPasswordResetCode(user.id);
  if (latestCode && !latestCode.consumedAt) {
    const cooldownUntil = addSeconds(
      new Date(latestCode.lastSentAt),
      AUTH_OTP_RESEND_COOLDOWN_SECONDS
    );
    if (cooldownUntil.getTime() > now.getTime()) {
      const remaining = Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000);
      throw new AuthOperationError(
        `Debes esperar ${remaining} segundos para reenviar el codigo.`,
        429,
        "OTP_COOLDOWN"
      );
    }
  }

  const windowSince = addMinutes(now, -AUTH_OTP_WINDOW_MINUTES).toISOString();
  const sendCount = await countPasswordResetSendsSince(user.id, windowSince);
  if (sendCount >= AUTH_OTP_WINDOW_MAX_SENDS) {
    throw new AuthOperationError(
      "Superaste el limite de reenvios de codigo. Intenta mas tarde.",
      429,
      "OTP_RATE_LIMIT"
    );
  }

  const otpCode = generateOtpCode();
  const otpHash = hashOtpCode(otpCode);
  const expiresAtDate = addMinutes(now, AUTH_OTP_TTL_MINUTES);
  const expiresAtIso = expiresAtDate.toISOString();
  const nowValue = now.toISOString();

  await insertPasswordResetCode(user.id, otpHash, expiresAtIso, nowValue);

  try {
    await sendPasswordResetOtpByEmail(user.email, otpCode, expiresAtDate);
    return {
      delivery: "email",
      expiresAt: expiresAtIso,
    };
  } catch (error) {
    if (
      error instanceof BrevoConfigError &&
      process.env.NODE_ENV !== "production" &&
      isDevOtpFallbackEnabled()
    ) {
      return {
        delivery: "dev",
        expiresAt: expiresAtIso,
        devCode: otpCode,
      };
    }

    if (error instanceof Error) {
      throw new AuthOperationError(
        error.message,
        502,
        "OTP_SEND_FAILED"
      );
    }

    throw new AuthOperationError(
      "No se pudo enviar el codigo OTP.",
      502,
      "OTP_SEND_FAILED"
    );
  }
}

async function issueSessionTokenForUser(user: AuthSessionUser) {
  const expiresAt = toUnixSeconds(addSeconds(new Date(), AUTH_SESSION_TTL_SECONDS));
  const payload: SessionTokenPayload = {
    v: 1,
    uid: user.id,
    email: user.email,
    role: user.role,
    exp: expiresAt,
  };

  return createSessionToken(payload, getSessionSecret());
}

export async function issueClientGuestSessionToken() {
  return issueSessionTokenForUser({
    id: GUEST_CLIENT_UID,
    email: GUEST_CLIENT_EMAIL,
    role: "CLIENTE",
  });
}

async function parseSessionCookie(token: string): Promise<SessionReadResult | null> {
  const payload = await verifySessionToken(token, getSessionSecret());
  if (!payload) {
    return null;
  }

  return {
    user: {
      id: payload.uid,
      email: payload.email,
      role: payload.role,
    },
    exp: payload.exp,
  };
}

export function readSessionTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  return parseCookieValue(cookieHeader, AUTH_COOKIE_NAME);
}

export function readClientModeReturnTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  return parseCookieValue(cookieHeader, AUTH_CLIENT_MODE_RETURN_COOKIE_NAME);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_SESSION_TTL_SECONDS,
  });
}

export function setClientModeReturnCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: AUTH_CLIENT_MODE_RETURN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function clearClientModeReturnCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_CLIENT_MODE_RETURN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionFromRequest(
  request: Request
): Promise<SessionReadResult | null> {
  const token = readSessionTokenFromRequest(request);
  if (!token) {
    return null;
  }

  return parseSessionCookie(token);
}

export async function readClientModeReturnSessionFromRequest(
  request: Request
): Promise<SessionReadResult | null> {
  const token = readClientModeReturnTokenFromRequest(request);
  if (!token) {
    return null;
  }

  return parseSessionCookie(token);
}

export async function readSessionFromServerCookies(): Promise<SessionReadResult | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return null;
  }

  return parseSessionCookie(token);
}

export async function readClientModeReturnSessionFromServerCookies(): Promise<
  SessionReadResult | null
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_CLIENT_MODE_RETURN_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return null;
  }

  return parseSessionCookie(token);
}

function canExitClientModeFromSessions(
  activeSession: SessionReadResult,
  returnSession: SessionReadResult | null
) {
  return (
    activeSession.user.role === "CLIENTE" &&
    returnSession?.user.role === "ADMIN"
  );
}

async function resolveSessionViewUser(user: AuthSessionUser): Promise<SessionViewUser> {
  try {
    const profile = await fetchSessionUserProfileById(user.id);
    return {
      ...user,
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      hierarchy: profile?.hierarchy ?? null,
      personalType: profile?.personalType ?? null,
    };
  } catch {
    return {
      ...user,
      firstName: null,
      lastName: null,
      hierarchy: null,
      personalType: null,
    };
  }
}

export async function getSessionViewFromRequest(
  request: Request
): Promise<SessionView> {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return {
      authenticated: false,
      user: null,
      permissions: null,
      canExitClientMode: false,
    };
  }

  const returnSession = await readClientModeReturnSessionFromRequest(request);
  const user = await resolveSessionViewUser(session.user);

  return {
    authenticated: true,
    user,
    permissions: buildPermissionsForRole(user.role),
    canExitClientMode: canExitClientModeFromSessions(session, returnSession),
  };
}

export async function getSessionViewFromServerCookies(): Promise<SessionView> {
  const session = await readSessionFromServerCookies();
  if (!session) {
    return {
      authenticated: false,
      user: null,
      permissions: null,
      canExitClientMode: false,
    };
  }

  const returnSession = await readClientModeReturnSessionFromServerCookies();
  const user = await resolveSessionViewUser(session.user);

  return {
    authenticated: true,
    user,
    permissions: buildPermissionsForRole(user.role),
    canExitClientMode: canExitClientModeFromSessions(session, returnSession),
  };
}

export async function requireAuthSession(
  request: Request
): Promise<{ ok: true; session: SessionReadResult } | { ok: false; response: NextResponse }> {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No autenticado.", code: "UNAUTHORIZED" },
        { status: 401 }
      ),
    };
  }

  return { ok: true, session };
}

export async function requireRoleSession(
  request: Request,
  requiredRole: AppRole
): Promise<{ ok: true; session: SessionReadResult } | { ok: false; response: NextResponse }> {
  const authResult = await requireAuthSession(request);
  if (!authResult.ok) {
    return authResult;
  }

  if (authResult.session.user.role !== requiredRole) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "No autorizado para esta operacion.", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }

  return authResult;
}

export async function readBootstrapStatus() {
  const hasUsers = await hasAnyUser();
  return {
    bootstrapOpen: !hasUsers,
  };
}

function normalizeSignupProfile(profileInput: SignupProfileInput): SignupProfileInput {
  const requiresHierarchy = profileInput.personalType !== "Civil";
  const normalizedHierarchy = asNonEmptyString(profileInput.hierarchy);
  if (requiresHierarchy && !normalizedHierarchy) {
    throw new AuthOperationError(
      "Selecciona una jerarquia valida para el tipo de personal.",
      400,
      "INVALID_HIERARCHY"
    );
  }

  return {
    firstName: normalizePersonName(profileInput.firstName),
    lastName: normalizePersonName(profileInput.lastName),
    personalType: profileInput.personalType,
    hierarchy: requiresHierarchy ? normalizedHierarchy : null,
    area: normalizeInputText(profileInput.area),
  } satisfies SignupProfileInput;
}

export async function listUsersForAdmin() {
  return fetchAdminUsers();
}

export async function createUserByAdmin(
  emailInput: string,
  password: string,
  profileInput: SignupProfileInput,
  actorUserId: string,
  request: Request
) {
  const email = normalizeInputText(emailInput).toLowerCase();
  const profile = normalizeSignupProfile(profileInput);

  const existingUser = await fetchUserByEmail(email);
  if (existingUser) {
    throw new AuthOperationError(
      "Ya existe un usuario con ese e-mail.",
      409,
      "USER_ALREADY_EXISTS"
    );
  }

  const passwordHash = await hash(password, AUTH_PASSWORD_SALT_ROUNDS);
  const createdUser = await insertUser(email, passwordHash, profile);
  await insertUserRole(createdUser.id, "ADMIN");
  await insertAuditLog(
    request,
    "auth.admin_user.created",
    `${email}:ADMIN`,
    actorUserId
  );

  return {
    id: createdUser.id,
    email: createdUser.email,
    role: "ADMIN" as const,
    status: createdUser.status,
  };
}

export async function createPublicSignupUser(
  emailInput: string,
  password: string,
  profileInput: SignupProfileInput,
  request: Request
) {
  const email = normalizeInputText(emailInput).toLowerCase();
  const profile = normalizeSignupProfile(profileInput);

  const existingUser = await fetchUserByEmail(email);
  if (existingUser) {
    throw new AuthOperationError(
      "Ya existe un usuario con ese e-mail.",
      409,
      "USER_ALREADY_EXISTS"
    );
  }

  const isBootstrapSignup = !(await hasAnyUser());
  const role: AppRole = "ADMIN";
  const passwordHash = await hash(password, AUTH_PASSWORD_SALT_ROUNDS);
  const createdUser = await insertUser(email, passwordHash, profile);
  await insertUserRole(createdUser.id, role);
  await insertAuditLog(
    request,
    isBootstrapSignup ? "auth.bootstrap.created" : "auth.signup.created",
    `${email}:${role}`,
    createdUser.id
  );
  const otp = await issueOtpForUser(createdUser);
  await insertAuditLog(request, "auth.otp.sent", email, createdUser.id);

  return {
    email: createdUser.email,
    role,
    bootstrap: isBootstrapSignup,
    otp,
  };
}

export async function requestEmailOtp(emailInput: string, request: Request) {
  const email = normalizeInputText(emailInput).toLowerCase();
  const user = await fetchUserByEmail(email);
  if (!user) {
    return {
      email,
      alreadyVerified: false,
      otp: null as OtpDispatchResult | null,
    };
  }

  if (user.status === "disabled") {
    throw new AuthOperationError(
      "La cuenta esta deshabilitada.",
      403,
      "USER_DISABLED"
    );
  }

  if (user.status === "active") {
    return {
      email,
      alreadyVerified: true,
      otp: null as OtpDispatchResult | null,
    };
  }

  const otp = await issueOtpForUser(user);
  await insertAuditLog(request, "auth.otp.sent", email, user.id);

  return {
    email,
    alreadyVerified: false,
    otp,
  };
}

export async function requestPasswordResetOtp(
  emailInput: string,
  request: Request
) {
  const email = normalizeInputText(emailInput).toLowerCase();
  const user = await fetchUserByEmail(email);
  if (!user || user.status === "disabled") {
    return {
      email,
      otp: null as OtpDispatchResult | null,
    };
  }

  const otp = await issuePasswordResetOtpForUser(user);
  await insertAuditLog(request, "auth.password_reset.requested", email, user.id);

  return {
    email,
    otp,
  };
}

export async function verifyEmailOtp(
  emailInput: string,
  code: string,
  request: Request
) {
  const email = normalizeInputText(emailInput).toLowerCase();
  const user = await fetchUserByEmail(email);
  if (!user) {
    throw new AuthOperationError(
      "No existe un usuario para ese e-mail.",
      404,
      "USER_NOT_FOUND"
    );
  }

  if (user.status === "disabled") {
    throw new AuthOperationError(
      "La cuenta esta deshabilitada.",
      403,
      "USER_DISABLED"
    );
  }

  const latestCode = await fetchLatestOtpCode(user.id);
  if (!latestCode || latestCode.consumedAt) {
    throw new AuthOperationError(
      "No hay un codigo pendiente para verificar.",
      400,
      "OTP_NOT_FOUND"
    );
  }

  const now = new Date();
  if (new Date(latestCode.expiresAt).getTime() <= now.getTime()) {
    throw new AuthOperationError(
      "El codigo vencio. Solicita uno nuevo.",
      400,
      "OTP_EXPIRED"
    );
  }

  if (latestCode.attempts >= AUTH_OTP_MAX_ATTEMPTS) {
    throw new AuthOperationError(
      "Superaste el maximo de intentos para este codigo.",
      429,
      "OTP_MAX_ATTEMPTS"
    );
  }

  const incomingHash = hashOtpCode(code);
  if (incomingHash !== latestCode.codeHash) {
    const nextAttempts = latestCode.attempts + 1;
    await updateOtpAttempts(latestCode.id, nextAttempts);
    const remaining = Math.max(0, AUTH_OTP_MAX_ATTEMPTS - nextAttempts);
    throw new AuthOperationError(
      remaining > 0
        ? `Codigo incorrecto. Te quedan ${remaining} intentos.`
        : "Codigo incorrecto. Alcanzaste el maximo de intentos.",
      400,
      "OTP_INVALID"
    );
  }

  await consumeOtpCode(latestCode.id);
  if (user.status !== "active") {
    await updateUserStatus(user.id, "active");
  }

  const role = await resolveUserRoleWithBootstrapRecovery(user);
  if (!role) {
    throw new AuthOperationError(
      "El usuario no tiene rol asignado.",
      500,
      "ROLE_MISSING"
    );
  }

  await updateUserLastLogin(user.id);
  await insertAuditLog(request, "auth.otp.verified", email, user.id);
  const sessionUser = buildSessionUser(user.id, user.email, role);
  const sessionToken = await issueSessionTokenForUser(sessionUser);

  return {
    user: sessionUser,
    sessionToken,
  };
}

type PasswordResetOtpValidation = {
  email: string;
  user: InternalUserRow;
  codeRow: InternalOtpCodeRow;
};

async function validatePasswordResetOtpOrThrow(
  emailInput: string,
  code: string
): Promise<PasswordResetOtpValidation> {
  const email = normalizeInputText(emailInput).toLowerCase();
  const user = await fetchUserByEmail(email);
  if (!user) {
    throw new AuthOperationError(
      "Codigo invalido o vencido. Solicita uno nuevo.",
      400,
      "OTP_INVALID"
    );
  }

  if (user.status === "disabled") {
    throw new AuthOperationError(
      "La cuenta esta deshabilitada.",
      403,
      "USER_DISABLED"
    );
  }

  const latestCode = await fetchLatestPasswordResetCode(user.id);
  if (!latestCode || latestCode.consumedAt) {
    throw new AuthOperationError(
      "No hay un codigo pendiente para recuperar la contrasena.",
      400,
      "OTP_NOT_FOUND"
    );
  }

  const now = new Date();
  if (new Date(latestCode.expiresAt).getTime() <= now.getTime()) {
    throw new AuthOperationError(
      "El codigo vencio. Solicita uno nuevo.",
      400,
      "OTP_EXPIRED"
    );
  }

  if (latestCode.attempts >= AUTH_OTP_MAX_ATTEMPTS) {
    throw new AuthOperationError(
      "Superaste el maximo de intentos para este codigo.",
      429,
      "OTP_MAX_ATTEMPTS"
    );
  }

  const incomingHash = hashOtpCode(code);
  if (incomingHash !== latestCode.codeHash) {
    const nextAttempts = latestCode.attempts + 1;
    await updatePasswordResetAttempts(latestCode.id, nextAttempts);
    const remaining = Math.max(0, AUTH_OTP_MAX_ATTEMPTS - nextAttempts);
    throw new AuthOperationError(
      remaining > 0
        ? `Codigo incorrecto. Te quedan ${remaining} intentos.`
        : "Codigo incorrecto. Alcanzaste el maximo de intentos.",
      400,
      "OTP_INVALID"
    );
  }

  return {
    email,
    user,
    codeRow: latestCode,
  };
}

export async function validatePasswordResetOtp(emailInput: string, code: string) {
  const validated = await validatePasswordResetOtpOrThrow(emailInput, code);
  return {
    email: validated.user.email,
  };
}

export async function resetPasswordWithOtp(
  emailInput: string,
  code: string,
  newPassword: string,
  request: Request
) {
  const validated = await validatePasswordResetOtpOrThrow(emailInput, code);

  const passwordHash = await hash(newPassword, AUTH_PASSWORD_SALT_ROUNDS);
  await updateUserPasswordHash(validated.user.id, passwordHash);
  await consumePasswordResetCode(validated.codeRow.id);
  await insertAuditLog(
    request,
    "auth.password_reset.completed",
    validated.email,
    validated.user.id
  );

  return {
    email: validated.user.email,
  };
}

export async function changePasswordForAuthenticatedUser(
  userIdInput: string,
  currentPassword: string,
  newPassword: string,
  request: Request
) {
  const userId = asNonEmptyString(userIdInput);
  if (!userId || !isUuid(userId)) {
    throw new AuthOperationError(
      "La sesión actual no permite cambiar la contraseña.",
      403,
      "FORBIDDEN"
    );
  }

  const user = await fetchUserById(userId);
  if (!user) {
    throw new AuthOperationError(
      "No se encontro el usuario autenticado.",
      404,
      "USER_NOT_FOUND"
    );
  }

  if (user.status === "disabled") {
    throw new AuthOperationError(
      "La cuenta esta deshabilitada.",
      403,
      "USER_DISABLED"
    );
  }

  const matchesCurrent = await compare(currentPassword, user.passwordHash);
  if (!matchesCurrent) {
    throw new AuthOperationError(
      "La contraseña actual es incorrecta.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  if (currentPassword === newPassword) {
    throw new AuthOperationError(
      "La nueva contraseña debe ser distinta de la actual.",
      400,
      "PASSWORD_REUSE"
    );
  }

  const passwordHash = await hash(newPassword, AUTH_PASSWORD_SALT_ROUNDS);
  await updateUserPasswordHash(user.id, passwordHash);
  await insertAuditLog(request, "auth.password_changed", user.email, user.id);

  return {
    email: user.email,
  };
}

export async function loginWithEmail(
  emailInput: string,
  password: string,
  request: Request
) {
  const email = normalizeInputText(emailInput).toLowerCase();
  const since = addMinutes(new Date(), -AUTH_LOGIN_WINDOW_MINUTES).toISOString();
  const failedCount = await countAuditLogsSince("auth.login.failed", email, since);
  if (failedCount >= AUTH_LOGIN_MAX_ATTEMPTS) {
    throw new AuthOperationError(
      "Superaste el maximo de intentos de login. Intenta mas tarde.",
      429,
      "LOGIN_RATE_LIMIT"
    );
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    await insertAuditLog(request, "auth.login.failed", email);
    throw new AuthOperationError(
      "Credenciales invalidas.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const matches = await compare(password, user.passwordHash);
  if (!matches) {
    await insertAuditLog(request, "auth.login.failed", email, user.id);
    throw new AuthOperationError(
      "Credenciales invalidas.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  if (user.status === "disabled") {
    throw new AuthOperationError(
      "La cuenta esta deshabilitada.",
      403,
      "USER_DISABLED"
    );
  }

  if (user.status !== "active") {
    throw new AuthOperationError(
      "Debes verificar tu e-mail antes de iniciar sesion.",
      409,
      "EMAIL_NOT_VERIFIED"
    );
  }

  const role = await resolveUserRoleWithBootstrapRecovery(user);
  if (!role) {
    throw new AuthOperationError(
      "El usuario no tiene rol asignado.",
      500,
      "ROLE_MISSING"
    );
  }

  const sessionUser = buildSessionUser(user.id, user.email, role);
  await updateUserLastLogin(user.id);
  await insertAuditLog(request, "auth.login.success", email, user.id);
  const sessionToken = await issueSessionTokenForUser(sessionUser);

  return {
    user: sessionUser,
    sessionToken,
  };
}

export function buildAuthErrorResponse(error: unknown, fallback: string) {
  const parsed = buildApiError(error, fallback);
  return NextResponse.json(parsed.body, { status: parsed.status });
}
