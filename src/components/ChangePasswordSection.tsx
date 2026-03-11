"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  changePasswordPayloadSchema,
  evaluatePasswordRules,
} from "@/lib/auth/schemas";

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

const OPEN_SKELETON_DELAY_MS = 450;

function isApiError(value: unknown): value is ApiErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

function ChangePasswordFormSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-hidden="true">
      <div>
        <div className="auth-skeleton h-3 w-36 rounded" />
        <div className="auth-skeleton mt-2 h-10 w-full rounded-xl" />
      </div>
      <div>
        <div className="auth-skeleton h-3 w-36 rounded" />
        <div className="auth-skeleton mt-2 h-10 w-full rounded-xl" />
        <div className="mt-2 grid w-full grid-cols-4 gap-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <span
              key={`change-password-skeleton-meter-${index}`}
              className="auth-skeleton h-1.5 rounded-sm"
            />
          ))}
        </div>
      </div>
      <div>
        <div className="auth-skeleton h-3 w-44 rounded" />
        <div className="auth-skeleton mt-2 h-10 w-full rounded-xl" />
      </div>
      <div className="auth-skeleton h-10 w-44 rounded-full" />
    </div>
  );
}

export default function ChangePasswordSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openSkeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passwordChecks = useMemo(
    () => evaluatePasswordRules(newPassword),
    [newPassword]
  );
  const passwordRulesCompleted = [
    passwordChecks.hasMinLength,
    passwordChecks.hasUppercase,
    passwordChecks.hasNumber,
    passwordChecks.hasSpecialChar,
  ].filter(Boolean).length;
  const passwordMeterColorClass =
    passwordRulesCompleted <= 1
      ? "border-rose-300/70 bg-rose-400/70"
      : passwordRulesCompleted === 2
        ? "border-orange-300/70 bg-orange-400/70"
        : passwordRulesCompleted === 3
          ? "border-amber-300/75 bg-amber-400/75"
          : "border-emerald-300/75 bg-emerald-400/75";
  const isNewPasswordValid =
    passwordChecks.hasMinLength &&
    passwordChecks.hasUppercase &&
    passwordChecks.hasNumber &&
    passwordChecks.hasSpecialChar;
  const isPasswordConfirmed =
    confirmPassword.length > 0 && confirmPassword === newPassword;
  const isFormReady =
    currentPassword.length > 0 &&
    isNewPasswordValid &&
    isPasswordConfirmed &&
    currentPassword !== newPassword;

  useEffect(() => {
    return () => {
      if (openSkeletonTimerRef.current) {
        clearTimeout(openSkeletonTimerRef.current);
        openSkeletonTimerRef.current = null;
      }
    };
  }, []);

  function togglePanel() {
    setError(null);
    setMessage(null);

    if (isOpen) {
      if (openSkeletonTimerRef.current) {
        clearTimeout(openSkeletonTimerRef.current);
        openSkeletonTimerRef.current = null;
      }
      setIsPreparing(false);
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    setIsPreparing(true);
    if (openSkeletonTimerRef.current) {
      clearTimeout(openSkeletonTimerRef.current);
    }
    openSkeletonTimerRef.current = setTimeout(() => {
      setIsPreparing(false);
      openSkeletonTimerRef.current = null;
    }, OPEN_SKELETON_DELAY_MS);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const validation = changePasswordPayloadSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          isApiError(body) ? body.error : "No se pudo cambiar la contraseña."
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Contraseña actualizada correctamente.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cambiar la contraseña."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-white/15 bg-white/8 p-4 shadow-[0_10px_24px_rgba(2,8,23,0.28)] backdrop-blur-sm sm:p-5">
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={isOpen}
        aria-controls="change-password-panel"
        aria-label={isOpen ? "Ocultar cambio de contraseña" : "Abrir cambio de contraseña"}
        className="group flex w-full cursor-pointer items-start justify-between gap-3 rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/55"
      >
        <div>
          <h3 className="text-base font-bold text-slate-100">Cambiar contraseña</h3>
          <p className="mt-1 text-sm text-slate-300/80">
            Actualiza la contraseña de tu cuenta actual.
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
        <div id="change-password-panel">
          {isPreparing ? (
            <ChangePasswordFormSkeleton />
          ) : (
            <>
              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <label className="block text-sm text-slate-300/85">
                  Contraseña actual
                  <div className="relative mt-1">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/20 bg-slate-950/42 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/55 placeholder:text-slate-400/70 focus:ring-2"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-300/80 transition hover:bg-white/10"
                      aria-label={
                        showCurrentPassword
                          ? "Ocultar contraseña actual"
                          : "Ver contraseña actual"
                      }
                      disabled={isSubmitting}
                    >
                      <PasswordVisibilityIcon visible={showCurrentPassword} />
                    </button>
                  </div>
                </label>

                <label className="block text-sm text-slate-300/85">
                  Nueva contraseña
                  <div className="relative mt-1">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/20 bg-slate-950/42 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/55 placeholder:text-slate-400/70 focus:ring-2"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-300/80 transition hover:bg-white/10"
                      aria-label={
                        showNewPassword
                          ? "Ocultar nueva contraseña"
                          : "Ver nueva contraseña"
                      }
                      disabled={isSubmitting}
                    >
                      <PasswordVisibilityIcon visible={showNewPassword} />
                    </button>
                  </div>

                  <div className="mt-2 grid w-full grid-cols-4 gap-1">
                    {Array.from({ length: 4 }).map((_, index) => {
                      const isActive = index < passwordRulesCompleted;
                      return (
                        <span
                          key={`change-password-meter-${index}`}
                          className={`h-1.5 rounded-sm border transition-colors ${
                            isActive
                              ? passwordMeterColorClass
                              : "border-white/15 bg-white/10"
                          }`}
                        />
                      );
                    })}
                  </div>

                  <ul className="mt-2 space-y-1 text-xs">
                    <li
                      className={
                        passwordChecks.hasMinLength
                          ? "text-emerald-300"
                          : "text-slate-300/65"
                      }
                    >
                      {passwordChecks.hasMinLength ? "OK" : "-"} Más de 6 caracteres
                    </li>
                    <li
                      className={
                        passwordChecks.hasUppercase
                          ? "text-emerald-300"
                          : "text-slate-300/65"
                      }
                    >
                      {passwordChecks.hasUppercase ? "OK" : "-"} Al menos una mayúscula
                    </li>
                    <li
                      className={
                        passwordChecks.hasNumber
                          ? "text-emerald-300"
                          : "text-slate-300/65"
                      }
                    >
                      {passwordChecks.hasNumber ? "OK" : "-"} Al menos un número
                    </li>
                    <li
                      className={
                        passwordChecks.hasSpecialChar
                          ? "text-emerald-300"
                          : "text-slate-300/65"
                      }
                    >
                      {passwordChecks.hasSpecialChar ? "OK" : "-"} Al menos un carácter
                      especial
                    </li>
                  </ul>
                </label>

                <label className="block text-sm text-slate-300/85">
                  Confirmar nueva contraseña
                  <div className="relative mt-1">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/20 bg-slate-950/42 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/55 placeholder:text-slate-400/70 focus:ring-2"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-300/80 transition hover:bg-white/10"
                      aria-label={
                        showConfirmPassword
                          ? "Ocultar confirmación de nueva contraseña"
                          : "Ver confirmación de nueva contraseña"
                      }
                      disabled={isSubmitting}
                    >
                      <PasswordVisibilityIcon visible={showConfirmPassword} />
                    </button>
                  </div>
                  {confirmPassword.length > 0 ? (
                    <p
                      className={`mt-2 text-xs ${
                        isPasswordConfirmed ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {isPasswordConfirmed
                        ? "Las contraseñas coinciden"
                        : "Las contraseñas no coinciden"}
                    </p>
                  ) : null}
                </label>

                {currentPassword.length > 0 && currentPassword === newPassword ? (
                  <p className="text-xs text-rose-300/90">
                    La nueva contraseña debe ser distinta de la actual.
                  </p>
                ) : null}

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting || !isFormReady}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-sky-300/35 bg-sky-400/22 px-5 text-sm font-semibold text-sky-100 shadow-sm transition duration-300 ease-out hover:bg-sky-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Guardando..." : "Cambiar contraseña"}
                  </button>
                </div>
              </form>

              {message ? (
                <p className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-400/14 px-3 py-2 text-sm text-emerald-100">
                  {message}
                </p>
              ) : null}

              {error ? (
                <p className="mt-3 rounded-xl border border-rose-300/35 bg-rose-400/15 px-3 py-2 text-sm text-rose-100">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L21 19.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.58 10.58A2 2 0 0113.42 13.42"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9.88 5.18A10.91 10.91 0 0112 5c4.8 0 8.74 3.13 9.81 7-0.37 1.35-1.15 2.69-2.24 3.84"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.1 7.02C4.35 8.2 3.1 9.98 2.19 12c1.07 3.87 5.01 7 9.81 7 1.49 0 2.91-0.3 4.2-0.84"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M2.19 12C3.26 8.13 7.2 5 12 5s8.74 3.13 9.81 7c-1.07 3.87-5.01 7-9.81 7S3.26 15.87 2.19 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
