"use client";

import { useEffect, useState } from "react";

type AppRole = "ADMIN" | "CLIENTE";
type AppUserStatus = "pending_verification" | "active" | "disabled";

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

type UserSummaryPayload = {
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

type UserListResponse = {
  ok?: boolean;
  users?: UserSummaryPayload[];
};

function isApiError(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

function formatRoleLabel(role: AppRole | null) {
  if (role === "ADMIN") {
    return "ADMIN";
  }

  if (role === "CLIENTE") {
    return "CLIENTE";
  }

  return "SIN_ROL";
}

function formatStatusLabel(status: AppUserStatus) {
  if (status === "active") {
    return "ACTIVO";
  }

  if (status === "disabled") {
    return "DESHABILITADO";
  }

  return "PENDIENTE_VERIFICACION";
}

function formatIsoDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function AdminUsersManager() {
  const [isOpen, setIsOpen] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [users, setUsers] = useState<UserSummaryPayload[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadUsers() {
    setIsLoadingUsers(true);
    try {
      const response = await fetch("/api/auth/admin-users", {
        cache: "no-store",
      });
      const body = (await response.json()) as UserListResponse | ApiErrorPayload;
      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo cargar el listado de usuarios."
        );
      }

      setUsers(Array.isArray(body.users) ? body.users : []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cargar el listado de usuarios."
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/15 bg-white/8 p-4 shadow-[0_10px_24px_rgba(2,8,23,0.28)] backdrop-blur-sm sm:p-5">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls="admin-users-table-panel"
          aria-label={isOpen ? "Ocultar usuarios registrados" : "Abrir usuarios registrados"}
          className="group flex w-full cursor-pointer items-start justify-between gap-4 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/55"
        >
          <div>
            <h2 className="text-lg font-bold text-slate-100">Usuarios registrados</h2>
            <p className="mt-1 text-sm text-slate-300/80">
              Vista rapida de cuentas, rol y estado de verificacion.
            </p>
          </div>

          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center text-slate-300/85 transition group-hover:text-sky-200">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            >
              <path d="m5.5 7.5 4.5 5 4.5-5" />
            </svg>
          </span>
        </button>

        {isOpen ? (
          <div id="admin-users-table-panel">
            {isLoadingUsers ? (
              <p className="mt-4 text-sm text-slate-300/80">Cargando usuarios...</p>
            ) : users.length === 0 ? (
              <p className="mt-4 text-sm text-slate-300/80">No hay usuarios cargados.</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/15 bg-white/6">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead className="bg-slate-950/35 text-left text-xs uppercase tracking-wide text-slate-300/75">
                    <tr>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Rol</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2">Alta</th>
                      <th className="px-3 py-2">Ultimo login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-slate-100/90">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-3 py-2">{user.email}</td>
                        <td className="px-3 py-2">{formatRoleLabel(user.role)}</td>
                        <td className="px-3 py-2">{formatStatusLabel(user.status)}</td>
                        <td className="px-3 py-2">
                          {[user.lastName, user.firstName].filter(Boolean).join(", ") || "-"}
                        </td>
                        <td className="px-3 py-2">{user.area ?? "-"}</td>
                        <td className="px-3 py-2">{formatIsoDate(user.createdAt)}</td>
                        <td className="px-3 py-2">{formatIsoDate(user.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-300/35 bg-rose-400/15 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
    </div>
  );
}
