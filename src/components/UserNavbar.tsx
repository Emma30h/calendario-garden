"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

type UserNavbarProps = {
  email?: string | null;
  role?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  hierarchy?: string | null;
  personalType?: string | null;
  showInlineIdentity?: boolean;
  dashboardHref?: string;
  dashboardLabel?: string;
  hideDashboardLink?: boolean;
  className?: string;
};

type SessionViewResponse = {
  authenticated?: boolean;
  user?: {
    email?: string;
    role?: string;
    firstName?: string;
    lastName?: string;
    hierarchy?: string;
    personalType?: string;
  } | null;
};

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function formatRoleLabel(role: string | null) {
  const normalized = role?.trim().toUpperCase() ?? "";
  if (normalized === "ADMIN") {
    return "Administrador";
  }

  if (normalized === "CLIENTE") {
    return "Cliente";
  }

  return role ?? "Sin rol";
}

function getUserLabel(email: string | null) {
  if (!email) {
    return "Usuario";
  }

  return email.split("@")[0] ?? email;
}

function buildFullName(firstName: string | null, lastName: string | null) {
  const parts = [firstName, lastName].filter(
    (value): value is string => value !== null && value.length > 0
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

function buildIdentityLabel(
  hierarchy: string | null,
  personalType: string | null,
  firstName: string | null,
  lastName: string | null
) {
  const normalizedPersonalType = (personalType ?? "").trim().toLowerCase();
  let hierarchyLabel = hierarchy;

  if (normalizedPersonalType === "tecnico") {
    const cleanHierarchy = (hierarchy ?? "").trim();
    const hierarchyHasTechnicalSuffix = /\btec(?:n(?:i|í)co)?\.?\b/i.test(cleanHierarchy);

    if (!cleanHierarchy) {
      hierarchyLabel = "Técnico";
    } else if (!hierarchyHasTechnicalSuffix) {
      hierarchyLabel =
        cleanHierarchy.toLowerCase() === "agente"
          ? "Agente Técnico"
          : `${cleanHierarchy} Tec.`;
    } else {
      hierarchyLabel = cleanHierarchy;
    }
  }

  const fullName = buildFullName(firstName, lastName);
  if (hierarchyLabel && fullName) {
    return `${hierarchyLabel} ${fullName}`;
  }

  return fullName ?? hierarchyLabel ?? null;
}

function getAvatarLabel(email: string | null, role: string | null) {
  const source = email ?? role;
  if (!source) {
    return "U";
  }

  const firstLetter = source.trim().charAt(0).toUpperCase();
  return firstLetter || "U";
}

export default function UserNavbar({
  email,
  role,
  firstName,
  lastName,
  hierarchy,
  personalType,
  showInlineIdentity = false,
  dashboardHref,
  dashboardLabel,
  hideDashboardLink = false,
  className,
}: UserNavbarProps) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [fallbackEmail, setFallbackEmail] = useState<string | null>(null);
  const [fallbackRole, setFallbackRole] = useState<string | null>(null);
  const [fallbackFirstName, setFallbackFirstName] = useState<string | null>(null);
  const [fallbackLastName, setFallbackLastName] = useState<string | null>(null);
  const [fallbackHierarchy, setFallbackHierarchy] = useState<string | null>(null);
  const [fallbackPersonalType, setFallbackPersonalType] = useState<string | null>(null);

  const providedEmail = asNonEmptyString(email);
  const providedRole = asNonEmptyString(role);
  const providedFirstName = asNonEmptyString(firstName);
  const providedLastName = asNonEmptyString(lastName);
  const providedHierarchy = asNonEmptyString(hierarchy);
  const providedPersonalType = asNonEmptyString(personalType);
  const resolvedEmail = providedEmail ?? fallbackEmail;
  const resolvedRole = providedRole ?? fallbackRole;
  const resolvedFirstName = providedFirstName ?? fallbackFirstName;
  const resolvedLastName = providedLastName ?? fallbackLastName;
  const resolvedHierarchy = providedHierarchy ?? fallbackHierarchy;
  const resolvedPersonalType = providedPersonalType ?? fallbackPersonalType;

  const roleLabel = useMemo(() => formatRoleLabel(resolvedRole), [resolvedRole]);
  const isAdmin = useMemo(
    () => resolvedRole?.trim().toUpperCase() === "ADMIN",
    [resolvedRole]
  );
  const fullName = useMemo(
    () => buildFullName(resolvedFirstName, resolvedLastName),
    [resolvedFirstName, resolvedLastName]
  );
  const userLabel = useMemo(
    () => fullName ?? getUserLabel(resolvedEmail),
    [fullName, resolvedEmail]
  );
  const inlineIdentityLabel = useMemo(
    () =>
      buildIdentityLabel(
        resolvedHierarchy,
        resolvedPersonalType,
        resolvedFirstName,
        resolvedLastName
      ),
    [resolvedHierarchy, resolvedPersonalType, resolvedFirstName, resolvedLastName]
  );
  const avatarLabel = useMemo(
    () => getAvatarLabel(fullName ?? resolvedEmail, resolvedRole),
    [fullName, resolvedEmail, resolvedRole]
  );
  const resolvedDashboardHref = useMemo(() => {
    const explicitHref = asNonEmptyString(dashboardHref);
    if (explicitHref) {
      return explicitHref;
    }

    return isAdmin ? "/dashboard" : null;
  }, [dashboardHref, isAdmin]);
  const resolvedDashboardLabel = useMemo(
    () => asNonEmptyString(dashboardLabel) ?? "Dashboard",
    [dashboardLabel]
  );
  const shouldShowDashboardLink = useMemo(() => {
    if (hideDashboardLink || !isAdmin || !resolvedDashboardHref) {
      return false;
    }

    if (!pathname) {
      return true;
    }

    return !pathname.startsWith(resolvedDashboardHref);
  }, [hideDashboardLink, isAdmin, pathname, resolvedDashboardHref]);

  useEffect(() => {
    if (
      providedEmail &&
      providedRole &&
      providedFirstName &&
      providedLastName &&
      providedHierarchy &&
      providedPersonalType
    ) {
      return;
    }

    let isMounted = true;

    async function loadSessionView() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as SessionViewResponse;
        const emailFromSession = asNonEmptyString(body.user?.email);
        const roleFromSession = asNonEmptyString(body.user?.role);
        const firstNameFromSession = asNonEmptyString(body.user?.firstName);
        const lastNameFromSession = asNonEmptyString(body.user?.lastName);
        const hierarchyFromSession = asNonEmptyString(body.user?.hierarchy);
        const personalTypeFromSession = asNonEmptyString(body.user?.personalType);

        if (!isMounted) {
          return;
        }

        if (!providedEmail) {
          setFallbackEmail(emailFromSession);
        }
        if (!providedRole) {
          setFallbackRole(roleFromSession);
        }
        if (!providedFirstName) {
          setFallbackFirstName(firstNameFromSession);
        }
        if (!providedLastName) {
          setFallbackLastName(lastNameFromSession);
        }
        if (!providedHierarchy) {
          setFallbackHierarchy(hierarchyFromSession);
        }
        if (!providedPersonalType) {
          setFallbackPersonalType(personalTypeFromSession);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        if (!providedEmail) {
          setFallbackEmail(null);
        }
        if (!providedRole) {
          setFallbackRole(null);
        }
        if (!providedFirstName) {
          setFallbackFirstName(null);
        }
        if (!providedLastName) {
          setFallbackLastName(null);
        }
        if (!providedHierarchy) {
          setFallbackHierarchy(null);
        }
        if (!providedPersonalType) {
          setFallbackPersonalType(null);
        }
      }
    }

    void loadSessionView();

    return () => {
      isMounted = false;
    };
  }, [
    providedEmail,
    providedRole,
    providedFirstName,
    providedLastName,
    providedHierarchy,
    providedPersonalType,
  ]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!containerRef.current) {
        return;
      }

      const targetNode = event.target as Node | null;
      if (targetNode && !containerRef.current.contains(targetNode)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <div
      ref={containerRef}
      className={className ? `relative z-50 ${className}` : "relative z-50"}
    >
      <div className="flex items-center gap-3">
        {showInlineIdentity && inlineIdentityLabel ? (
          <p className="max-w-[20rem] truncate rounded-full border border-sky-200/30 bg-slate-900/72 px-3 py-1.5 text-right text-xs font-semibold tracking-wide text-slate-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-sm">
            {inlineIdentityLabel}
          </p>
        ) : null}

        <button
          type="button"
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-label="Abrir menú de usuario"
          onClick={() => {
            setIsMenuOpen((current) => !current);
          }}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-sky-200/40 bg-[linear-gradient(160deg,rgba(56,189,248,0.28)_0%,rgba(30,58,138,0.38)_100%)] text-sm font-bold text-sky-100 shadow-[0_10px_24px_rgba(2,8,23,0.42)] transition hover:bg-sky-400/34 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/65"
        >
          {avatarLabel}
        </button>
      </div>

      {isMenuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-14 z-[90] w-[19rem] rounded-2xl border border-sky-200/24 bg-[linear-gradient(145deg,rgba(15,23,42,0.985)_0%,rgba(15,23,42,0.965)_100%)] p-4 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-sm [backdrop-filter:blur(14px)_saturate(125%)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300/75">
            Usuario
          </p>

          <div className="mt-2 rounded-xl border border-white/16 bg-slate-900/82 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-100">{userLabel}</p>
            <p className="text-xs text-slate-300/80">{roleLabel}</p>
          </div>

          <dl className="mt-3 space-y-2 text-xs">
            <div className="rounded-lg border border-white/14 bg-slate-950/78 px-3 py-2">
              <dt className="font-semibold uppercase tracking-wide text-slate-400/85">Email</dt>
              <dd className="mt-1 break-all text-slate-100/90">
                {resolvedEmail ?? "No disponible"}
              </dd>
            </div>
            <div className="rounded-lg border border-white/14 bg-slate-950/78 px-3 py-2">
              <dt className="font-semibold uppercase tracking-wide text-slate-400/85">Rol</dt>
              <dd className="mt-1 text-slate-100/90">{roleLabel}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2">
            {shouldShowDashboardLink ? (
              <Link
                href={resolvedDashboardHref ?? "/dashboard"}
                role="menuitem"
                onClick={() => {
                  setIsMenuOpen(false);
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-sky-300/35 bg-sky-400/30 px-3 text-sm font-semibold text-sky-100 shadow-sm transition hover:bg-sky-400/38 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60"
              >
                {resolvedDashboardLabel}
              </Link>
            ) : null}
            <LogoutButton className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-rose-300/30 bg-rose-400/24 px-3 text-sm font-semibold text-rose-100 shadow-sm transition hover:bg-rose-400/32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/60 disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

