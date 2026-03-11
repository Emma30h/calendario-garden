import type { AppRole } from "@/lib/auth/types";

export type RolePermissions = {
  canAccessAnnualDashboard: boolean;
  canReadPersonalCargado: boolean;
  canManagePersonalCargado: boolean;
  canUploadEfemeridesPdf: boolean;
  canAccessEmailPanel: boolean;
};

const ADMIN_PERMISSIONS: RolePermissions = {
  canAccessAnnualDashboard: true,
  canReadPersonalCargado: true,
  canManagePersonalCargado: true,
  canUploadEfemeridesPdf: true,
  canAccessEmailPanel: true,
};

const CLIENTE_PERMISSIONS: RolePermissions = {
  canAccessAnnualDashboard: true,
  canReadPersonalCargado: true,
  canManagePersonalCargado: false,
  canUploadEfemeridesPdf: false,
  canAccessEmailPanel: false,
};

export function buildPermissionsForRole(role: AppRole): RolePermissions {
  return role === "ADMIN" ? ADMIN_PERMISSIONS : CLIENTE_PERMISSIONS;
}
