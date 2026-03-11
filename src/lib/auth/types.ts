export const APP_ROLES = ["ADMIN", "CLIENTE"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_USER_STATUSES = [
  "pending_verification",
  "active",
  "disabled",
] as const;
export type AppUserStatus = (typeof APP_USER_STATUSES)[number];

export type AuthSessionUser = {
  id: string;
  email: string;
  role: AppRole;
};

