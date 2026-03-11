"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  evaluatePasswordRules,
  getSignupHierarchyOptions,
  loginPayloadSchema,
  requestPasswordResetPayloadSchema,
  requestOtpPayloadSchema,
  resetPasswordPayloadSchema,
  SIGNUP_AREA_CATEGORIES,
  SIGNUP_PERSONAL_TYPES,
  type SignupPersonalType,
  signupPayloadSchema,
  verifyOtpPayloadSchema,
} from "@/lib/auth/schemas";

type ApiErrorPayload = {
  error?: string;
  code?: string;
};

type OtpPayload = {
  delivery: "email" | "dev";
  expiresAt: string;
  devCode?: string;
};

type BootstrapStatusPayload = {
  bootstrapOpen?: boolean;
};

type LoginSuccessPayload = {
  ok?: boolean;
  user?: {
    id: string;
    email: string;
    role: "ADMIN" | "CLIENTE";
  };
};

type SignupSuccessPayload = {
  ok?: boolean;
  requiresVerification?: boolean;
  email?: string;
  role?: "ADMIN" | "CLIENTE";
  bootstrap?: boolean;
  otp?: OtpPayload;
};

type OtpRequestPayload = {
  ok?: boolean;
  email?: string;
  alreadyVerified?: boolean;
  otp?: OtpPayload | null;
};

type PasswordResetRequestPayload = {
  ok?: boolean;
  email?: string;
  otp?: OtpPayload | null;
};

type ResetPasswordSuccessPayload = {
  ok?: boolean;
  email?: string;
};

type ValidatePasswordResetOtpPayload = {
  ok?: boolean;
  email?: string;
};

type AuthMode = "login" | "signup" | "verify" | "reset-request" | "reset-verify";
const OTP_LENGTH = 6;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function isApiError(value: unknown): value is ApiErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof (value as { error?: unknown }).error === "string";
}

function resolveErrorMessage(
  value: unknown,
  fallback: string
): { message: string; code: string | null } {
  if (isApiError(value)) {
    const code =
      typeof value.code === "string" && value.code.length > 0 ? value.code : null;
    return {
      message: value.error ?? fallback,
      code,
    };
  }

  return {
    message: fallback,
    code: null,
  };
}

function parseOtpCooldownSeconds(message: string) {
  const matched = message.match(/(\d+)\s*segundos?/i);
  if (!matched) {
    return null;
  }

  const parsed = Number.parseInt(matched[1] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildClienteStartPath() {
  const now = new Date();
  return `/mes/${now.getMonth() + 1}/dia/${now.getDate()}`;
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

function LoginFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="auth-skeleton h-2.5 w-24 rounded-full" />
      <div className="space-y-2.5">
        <div className="auth-skeleton h-3 w-16 rounded-full" />
        <div className="auth-skeleton h-11 w-full rounded-xl" />
      </div>
      <div className="space-y-2.5">
        <div className="auth-skeleton h-3 w-24 rounded-full" />
        <div className="auth-skeleton h-11 w-full rounded-xl" />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <div className="auth-skeleton h-11 w-40 rounded-full" />
        <div className="auth-skeleton h-11 w-36 rounded-full" />
      </div>
      <div className="auth-skeleton h-3 w-44 rounded-full" />
    </div>
  );
}

function SignupFormSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="auth-skeleton h-2.5 w-32 rounded-full" />
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={`signup-skeleton-field-${index}`} className="space-y-2.5">
          <div
            className={`auth-skeleton h-3 rounded-full ${
              index % 2 === 0 ? "w-24" : "w-32"
            }`}
          />
          <div className="auth-skeleton h-11 w-full rounded-xl" />
        </div>
      ))}
      <div className="space-y-2.5">
        <div className="auth-skeleton h-3 w-40 rounded-full" />
        <div className="auth-skeleton h-11 w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-4 gap-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`signup-skeleton-meter-${index}`}
            className="auth-skeleton h-1.5 rounded-full"
          />
        ))}
      </div>
      <div className="auth-skeleton h-11 w-full rounded-full" />
      <div className="auth-skeleton h-3 w-40 rounded-full" />
    </div>
  );
}

type OtpDigitInputProps = {
  idPrefix: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
};

function OtpDigitInput({
  idPrefix,
  value,
  onChange,
  disabled = false,
}: OtpDigitInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const normalizedValue = value.replace(/[^\d]/g, "").slice(0, OTP_LENGTH);
  const digits = useMemo(
    () =>
      Array.from({ length: OTP_LENGTH }, (_, index) => normalizedValue[index] ?? ""),
    [normalizedValue]
  );
  const firstMissingIndex = digits.findIndex((digit) => digit.length === 0);
  const hasCompleteCode = firstMissingIndex === -1;
  const maxEnabledIndex = hasCompleteCode ? OTP_LENGTH - 1 : firstMissingIndex;

  function focusIndex(index: number) {
    const nextIndex = Math.max(0, Math.min(index, OTP_LENGTH - 1));
    inputRefs.current[nextIndex]?.focus();
    inputRefs.current[nextIndex]?.select();
  }

  useEffect(() => {
    if (disabled) {
      return;
    }

    if (normalizedValue.length === 0) {
      const firstInput = inputRefs.current[0];
      firstInput?.focus();
      firstInput?.select();
      return;
    }

    if (pendingFocusIndexRef.current === null) {
      return;
    }

    focusIndex(pendingFocusIndexRef.current);
    pendingFocusIndexRef.current = null;
  }, [disabled, idPrefix, normalizedValue.length]);

  function updateDigitAt(index: number, digit: string) {
    const nextDigits = [...digits];
    nextDigits[index] = digit;
    onChange(nextDigits.join("").slice(0, OTP_LENGTH));
  }

  function handleFocus(index: number) {
    if (disabled) {
      return;
    }

    if (!hasCompleteCode && index > maxEnabledIndex) {
      focusIndex(maxEnabledIndex);
    }
  }

  function handleChange(index: number, rawValue: string) {
    if (disabled) {
      return;
    }

    const incomingDigits = rawValue.replace(/[^\d]/g, "");
    if (!incomingDigits) {
      updateDigitAt(index, "");
      return;
    }

    if (!hasCompleteCode && index > maxEnabledIndex) {
      pendingFocusIndexRef.current = maxEnabledIndex;
      focusIndex(maxEnabledIndex);
      return;
    }

    const nextDigits = [...digits];
    for (let offset = 0; offset < incomingDigits.length; offset += 1) {
      const currentIndex = index + offset;
      if (currentIndex >= OTP_LENGTH) {
        break;
      }
      nextDigits[currentIndex] = incomingDigits[offset] ?? "";
    }

    onChange(nextDigits.join("").slice(0, OTP_LENGTH));
    const nextFocusIndex = Math.min(
      OTP_LENGTH - 1,
      index + Math.max(1, incomingDigits.length)
    );
    if (nextFocusIndex > index) {
      pendingFocusIndexRef.current = nextFocusIndex;
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        updateDigitAt(index, "");
        return;
      }

      if (index > 0) {
        updateDigitAt(index - 1, "");
        focusIndex(index - 1);
      }
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      updateDigitAt(index, "");
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (index > 0) {
        focusIndex(index - 1);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (index < OTP_LENGTH - 1) {
        focusIndex(index + 1);
      }
    }
  }

  function handlePaste(
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>
  ) {
    if (disabled) {
      return;
    }

    const pastedDigits = event.clipboardData
      .getData("text")
      .replace(/[^\d]/g, "")
      .slice(0, OTP_LENGTH);
    if (!pastedDigits) {
      return;
    }

    event.preventDefault();
    const startIndex = hasCompleteCode ? index : maxEnabledIndex;
    const nextDigits = [...digits];
    for (let offset = 0; offset < pastedDigits.length; offset += 1) {
      const currentIndex = startIndex + offset;
      if (currentIndex >= OTP_LENGTH) {
        break;
      }

      nextDigits[currentIndex] = pastedDigits[offset] ?? "";
    }

    onChange(nextDigits.join("").slice(0, OTP_LENGTH));
    const lastWrittenIndex = Math.min(
      OTP_LENGTH - 1,
      startIndex + pastedDigits.length - 1
    );
    focusIndex(lastWrittenIndex);
  }

  return (
    <div
      className="mx-auto mt-3 grid w-full min-w-0 max-w-[20rem] grid-cols-6 gap-1.5 sm:max-w-[28rem] sm:gap-3"
      role="group"
      aria-label="Código OTP de 6 dígitos"
    >
      {digits.map((digit, index) => (
        <input
          key={`${idPrefix}-${index}`}
          id={`${idPrefix}-${index}`}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          onFocus={() => {
            handleFocus(index);
          }}
          onChange={(event) => {
            handleChange(index, event.target.value);
          }}
          onKeyDown={(event) => {
            handleKeyDown(index, event);
          }}
          onPaste={(event) => {
            handlePaste(index, event);
          }}
          disabled={disabled}
          aria-label={`Digito ${index + 1} de ${OTP_LENGTH}`}
          className="h-12 w-full rounded-xl border border-white/25 bg-slate-950/45 text-center text-lg font-semibold tracking-wide text-slate-100 outline-none ring-sky-300/40 transition focus:ring-2 sm:h-14 sm:text-xl disabled:cursor-not-allowed disabled:bg-slate-900/50"
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const safeNextPath = useMemo(() => {
    if (!nextParam || !nextParam.startsWith("/")) {
      return null;
    }

    return nextParam;
  }, [nextParam]);

  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(true);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalType, setPersonalType] = useState<SignupPersonalType | "">("");
  const [hierarchy, setHierarchy] = useState("");
  const [area, setArea] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [resetOtpCode, setResetOtpCode] = useState("");
  const [isResetOtpValidated, setIsResetOtpValidated] = useState(false);
  const [validatedResetOtpCode, setValidatedResetOtpCode] = useState<string | null>(
    null
  );
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingResetEmail, setPendingResetEmail] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verifyOtpCooldownSeconds, setVerifyOtpCooldownSeconds] = useState(0);
  const [resetOtpCooldownSeconds, setResetOtpCooldownSeconds] = useState(0);
  const verifyFormRef = useRef<HTMLFormElement | null>(null);
  const resetVerifyFormRef = useRef<HTMLFormElement | null>(null);
  const lastAutoSubmittedOtpRef = useRef<string | null>(null);
  const lastAutoSubmittedResetOtpRef = useRef<string | null>(null);
  const emailValidation = useMemo(
    () => requestOtpPayloadSchema.safeParse({ email }),
    [email]
  );
  const isEmailValid = emailValidation.success;
  const hasEmailInput = email.trim().length > 0;
  const emailInputError =
    hasEmailInput && !isEmailValid
      ? emailValidation.error.issues[0]?.message ??
        "Debes ingresar un e-mail válido."
      : null;
  const isLoginReady = isEmailValid && password.length > 0;
  const signupHierarchyOptions = useMemo(
    () => (personalType ? Array.from(getSignupHierarchyOptions(personalType)) : []),
    [personalType]
  );

  useEffect(() => {
    if (signupHierarchyOptions.length === 0) {
      if (hierarchy) {
        setHierarchy("");
      }
      return;
    }

    if (!signupHierarchyOptions.includes(hierarchy)) {
      setHierarchy("");
    }
  }, [hierarchy, signupHierarchyOptions]);

  const signupPasswordChecks = useMemo(
    () => evaluatePasswordRules(password),
    [password]
  );
  const requiresHierarchy = personalType.length > 0 && personalType !== "Civil";
  const isSignupPasswordValid =
    signupPasswordChecks.hasMinLength &&
    signupPasswordChecks.hasUppercase &&
    signupPasswordChecks.hasNumber &&
    signupPasswordChecks.hasSpecialChar;
  const isSignupPasswordConfirmed =
    confirmPassword.length > 0 && confirmPassword === password;
  const isSignupReady =
    isEmailValid &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    personalType.length > 0 &&
    (!requiresHierarchy || hierarchy.length > 0) &&
    area.length > 0 &&
    isSignupPasswordValid &&
    isSignupPasswordConfirmed;
  const signupPasswordRulesCompleted = [
    signupPasswordChecks.hasMinLength,
    signupPasswordChecks.hasUppercase,
    signupPasswordChecks.hasNumber,
    signupPasswordChecks.hasSpecialChar,
  ].filter(Boolean).length;
  const signupPasswordMeterLevel = signupPasswordRulesCompleted;
  const signupPasswordMeterColorClass =
    signupPasswordMeterLevel <= 1
      ? "border-red-500 bg-rose-400/150"
      : signupPasswordMeterLevel === 2
        ? "border-orange-500 bg-orange-500"
        : signupPasswordMeterLevel === 3
          ? "border-amber-500 bg-amber-400/150"
          : "border-green-600 bg-green-600";
  const resetPasswordChecks = useMemo(
    () => evaluatePasswordRules(resetPassword),
    [resetPassword]
  );
  const isResetPasswordValid =
    resetPasswordChecks.hasMinLength &&
    resetPasswordChecks.hasUppercase &&
    resetPasswordChecks.hasNumber &&
    resetPasswordChecks.hasSpecialChar;
  const isResetPasswordConfirmed =
    resetConfirmPassword.length > 0 && resetConfirmPassword === resetPassword;
  const resetPasswordRulesCompleted = [
    resetPasswordChecks.hasMinLength,
    resetPasswordChecks.hasUppercase,
    resetPasswordChecks.hasNumber,
    resetPasswordChecks.hasSpecialChar,
  ].filter(Boolean).length;
  const resetPasswordMeterColorClass =
    resetPasswordRulesCompleted <= 1
      ? "border-red-500 bg-rose-400/150"
      : resetPasswordRulesCompleted === 2
        ? "border-orange-500 bg-orange-500"
        : resetPasswordRulesCompleted === 3
          ? "border-amber-500 bg-amber-400/150"
          : "border-green-600 bg-green-600";
  const hasResetEmail = (pendingResetEmail ?? email).trim().length > 0;
  const isResetOtpReady =
    hasResetEmail &&
    resetOtpCode.length === OTP_LENGTH;
  const isResetPasswordReady =
    isResetOtpValidated &&
    hasResetEmail &&
    resetOtpCode.length === OTP_LENGTH &&
    isResetPasswordValid &&
    isResetPasswordConfirmed;

  useEffect(() => {
    let isMounted = true;

    async function loadBootstrapStatus() {
      try {
        const response = await fetch("/api/auth/bootstrap-status", {
          cache: "no-store",
        });
        const body = (await response.json()) as BootstrapStatusPayload | ApiErrorPayload;
        if (!response.ok || isApiError(body)) {
          throw new Error(
            isApiError(body)
              ? body.error
              : "No se pudo consultar estado inicial de la cuenta."
          );
        }

        if (!isMounted) {
          return;
        }

        const isOpen = body.bootstrapOpen === true;
        setBootstrapOpen(isOpen);
        setMode(isOpen ? "signup" : "login");
      } catch (caught) {
        if (!isMounted) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudo consultar estado inicial de la cuenta."
        );
      } finally {
        if (isMounted) {
          setIsLoadingBootstrap(false);
        }
      }
    }

    void loadBootstrapStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  function resetValidatedResetOtpState() {
    setIsResetOtpValidated(false);
    setValidatedResetOtpCode(null);
    setResetPassword("");
    setResetConfirmPassword("");
    setShowResetPassword(false);
    setShowResetConfirmPassword(false);
  }

  function resetPasswordRecoveryState() {
    setPendingResetEmail(null);
    setResetOtpCode("");
    resetValidatedResetOtpState();
    setResetOtpCooldownSeconds(0);
  }

  useEffect(() => {
    if (mode !== "verify") {
      lastAutoSubmittedOtpRef.current = null;
      return;
    }

    if (otpCode.length < OTP_LENGTH) {
      lastAutoSubmittedOtpRef.current = null;
      return;
    }

    if (isSubmitting) {
      return;
    }

    if (lastAutoSubmittedOtpRef.current === otpCode) {
      return;
    }

    lastAutoSubmittedOtpRef.current = otpCode;
    verifyFormRef.current?.requestSubmit();
  }, [isSubmitting, mode, otpCode]);

  useEffect(() => {
    if (mode !== "reset-verify" || isResetOtpValidated) {
      lastAutoSubmittedResetOtpRef.current = null;
      return;
    }

    if (resetOtpCode.length < OTP_LENGTH) {
      lastAutoSubmittedResetOtpRef.current = null;
      return;
    }

    if (isSubmitting) {
      return;
    }

    if (lastAutoSubmittedResetOtpRef.current === resetOtpCode) {
      return;
    }

    lastAutoSubmittedResetOtpRef.current = resetOtpCode;
    resetVerifyFormRef.current?.requestSubmit();
  }, [isResetOtpValidated, isSubmitting, mode, resetOtpCode]);

  useEffect(() => {
    if (verifyOtpCooldownSeconds <= 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setVerifyOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [verifyOtpCooldownSeconds]);

  useEffect(() => {
    if (resetOtpCooldownSeconds <= 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setResetOtpCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [resetOtpCooldownSeconds]);

  useEffect(() => {
    if (!isResetOtpValidated || !validatedResetOtpCode) {
      return;
    }

    if (resetOtpCode === validatedResetOtpCode) {
      return;
    }

    resetValidatedResetOtpState();
  }, [isResetOtpValidated, resetOtpCode, validatedResetOtpCode]);

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevOtpCode(null);

    const validation = loginPayloadSchema.safeParse({
      email,
      password,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as LoginSuccessPayload | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(body, "No se pudo iniciar sesión.");
        if (parsedError.code === "EMAIL_NOT_VERIFIED") {
          setPendingEmail(validation.data.email);
          setMode("verify");
          setOtpCode("");
          try {
            const otpResponse = await fetch("/api/auth/request-otp", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: validation.data.email,
              }),
            });
            const otpBody = (await otpResponse.json()) as
              | OtpRequestPayload
              | ApiErrorPayload;

            if (!otpResponse.ok || isApiError(otpBody)) {
              throw new Error(
                resolveErrorMessage(
                  otpBody,
                  "No se pudo enviar el código OTP."
                ).message
              );
            }

            if (otpBody.alreadyVerified) {
              setMode("login");
              setPendingEmail(null);
              setMessage("Tu cuenta ya estaba verificada. Inicia sesión nuevamente.");
              return;
            }

            setDevOtpCode(
              otpBody.otp?.delivery === "dev" ? otpBody.otp.devCode ?? null : null
            );
            setVerifyOtpCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
            setMessage(
              otpBody.otp?.delivery === "email"
                ? "Tu cuenta requiere verificación. Te enviamos un código OTP."
                : "Tu cuenta requiere verificación. Código OTP generado en modo desarrollo."
            );
          } catch {
            setMessage(
              "Tu cuenta requiere verificación por código OTP. Presiona Reenviar código."
            );
          }
          return;
        }

        throw new Error(parsedError.message);
      }

      const destination =
        safeNextPath ??
        (body.user?.role === "CLIENTE" ? buildClienteStartPath() : "/anual");
      router.replace(destination);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo iniciar sesión."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevOtpCode(null);

    const validation = signupPayloadSchema.safeParse({
      email,
      firstName,
      lastName,
      personalType,
      hierarchy,
      area,
      password,
      confirmPassword,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as SignupSuccessPayload | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo crear la cuenta."
        );
        throw new Error(parsedError.message);
      }

      const nextEmail = body.email ?? validation.data.email;
      setPendingEmail(nextEmail);
      setMode("verify");
      const roleLabel = body.role === "ADMIN" ? "ADMIN" : "CLIENTE";
      setMessage(
        body.otp?.delivery === "email"
          ? `Cuenta ${roleLabel} creada. Te enviamos un código de verificación por e-mail.`
          : `Cuenta ${roleLabel} creada. Código OTP generado en modo desarrollo.`
      );
      setDevOtpCode(body.otp?.delivery === "dev" ? body.otp.devCode ?? null : null);
      setVerifyOtpCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
      setOtpCode("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo crear la cuenta."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const emailToVerify = pendingEmail ?? email;
    const validation = verifyOtpPayloadSchema.safeParse({
      email: emailToVerify,
      code: otpCode,
    });
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ??
          "Debes enviar e-mail y código válido."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as LoginSuccessPayload | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo validar el código OTP."
        );
        throw new Error(parsedError.message);
      }

      const destination =
        safeNextPath ??
        (body.user?.role === "CLIENTE" ? buildClienteStartPath() : "/anual");
      router.replace(destination);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo validar el código OTP."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendOtp() {
    const emailToVerify = pendingEmail ?? email;
    setError(null);
    setMessage(null);
    setDevOtpCode(null);

    const validation = requestOtpPayloadSchema.safeParse({
      email: emailToVerify,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Debes ingresar un e-mail.");
      return;
    }

    setIsResendingOtp(true);
    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as OtpRequestPayload | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo reenviar el código OTP."
        );
        if (parsedError.code === "OTP_COOLDOWN") {
          const cooldownSeconds = parseOtpCooldownSeconds(parsedError.message);
          if (cooldownSeconds) {
            setVerifyOtpCooldownSeconds(cooldownSeconds);
          }
          setError(parsedError.message);
          return;
        }
        throw new Error(parsedError.message);
      }

      if (body.alreadyVerified) {
        setMessage("Este e-mail ya estaba verificado. Puedes iniciar sesión.");
        setMode("login");
        setPendingEmail(null);
        return;
      }

      setMode("verify");
      setPendingEmail(body.email ?? validation.data.email);
      setMessage(
        body.otp?.delivery === "email"
          ? "Te enviamos un nuevo código OTP."
          : "Nuevo código OTP generado en modo desarrollo."
      );
      setDevOtpCode(body.otp?.delivery === "dev" ? body.otp.devCode ?? null : null);
      setVerifyOtpCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
      setOtpCode("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo reenviar OTP."
      );
    } finally {
      setIsResendingOtp(false);
    }
  }

  async function handleRequestPasswordResetSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevOtpCode(null);

    const validation = requestPasswordResetPayloadSchema.safeParse({
      email,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Debes ingresar un e-mail.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as
        | PasswordResetRequestPayload
        | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo enviar el código de recuperación."
        );
        throw new Error(parsedError.message);
      }

      setPendingResetEmail(body.email ?? validation.data.email);
      setMode("reset-verify");
      setMessage(
        "Si el e-mail existe, enviamos un código para cambiar la contraseña."
      );
      setDevOtpCode(body.otp?.delivery === "dev" ? body.otp.devCode ?? null : null);
      setResetOtpCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
      setResetOtpCode("");
      resetValidatedResetOtpState();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo iniciar la recuperación de contraseña."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendPasswordResetOtp() {
    const emailToReset = pendingResetEmail ?? email;
    setError(null);
    setMessage(null);
    setDevOtpCode(null);

    const validation = requestPasswordResetPayloadSchema.safeParse({
      email: emailToReset,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Debes ingresar un e-mail.");
      return;
    }

    setIsResendingOtp(true);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as
        | PasswordResetRequestPayload
        | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo reenviar el código."
        );
        if (parsedError.code === "OTP_COOLDOWN") {
          const cooldownSeconds = parseOtpCooldownSeconds(parsedError.message);
          if (cooldownSeconds) {
            setResetOtpCooldownSeconds(cooldownSeconds);
          }
          setError(parsedError.message);
          return;
        }
        throw new Error(parsedError.message);
      }

      setPendingResetEmail(body.email ?? validation.data.email);
      setMode("reset-verify");
      setMessage(
        "Si el e-mail existe, enviamos un nuevo código para cambiar la contraseña."
      );
      setDevOtpCode(body.otp?.delivery === "dev" ? body.otp.devCode ?? null : null);
      setResetOtpCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
      setResetOtpCode("");
      resetValidatedResetOtpState();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo reenviar el código."
      );
    } finally {
      setIsResendingOtp(false);
    }
  }

  async function handleValidateResetOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const emailToReset = pendingResetEmail ?? email;
    const validation = verifyOtpPayloadSchema.safeParse({
      email: emailToReset,
      code: resetOtpCode,
    });
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message ??
          "Debes enviar e-mail y código válido."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/validate-password-reset-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as
        | ValidatePasswordResetOtpPayload
        | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo validar el código OTP."
        );
        throw new Error(parsedError.message);
      }

      setPendingResetEmail(body.email ?? validation.data.email);
      setIsResetOtpValidated(true);
      setValidatedResetOtpCode(validation.data.code);
      setMessage(
        "Código OTP validado. Ahora puedes ingresar tu nueva contraseña."
      );
    } catch (caught) {
      resetValidatedResetOtpState();
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo validar el código OTP."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isResetOtpValidated) {
      setError("Primero valida el código OTP.");
      return;
    }

    const emailToReset = pendingResetEmail ?? email;
    const validation = resetPasswordPayloadSchema.safeParse({
      email: emailToReset,
      code: resetOtpCode,
      password: resetPassword,
      confirmPassword: resetConfirmPassword,
    });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });
      const body = (await response.json()) as
        | ResetPasswordSuccessPayload
        | ApiErrorPayload;

      if (!response.ok || isApiError(body)) {
        const parsedError = resolveErrorMessage(
          body,
          "No se pudo cambiar la contraseña."
        );
        throw new Error(parsedError.message);
      }

      setMode("login");
      resetPasswordRecoveryState();
      setMessage("Contraseña actualizada. Ahora puedes iniciar sesión.");
      setPassword("");
      setConfirmPassword("");
      setShowLoginPassword(false);
      setDevOtpCode(null);
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

  const isSignupMode = mode === "signup";

  return (
    <main
      className={`flex h-screen min-h-[100dvh] max-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden overflow-y-auto bg-transparent px-3 py-8 sm:px-6 sm:py-10 ${
        isSignupMode ? "md:py-2" : ""
      }`}
    >
      <div
        className={`mx-auto w-full min-w-0 max-w-[calc(100vw-1.5rem)] rounded-3xl border border-white/20 bg-black/20 p-4 shadow-xl shadow-black/35 backdrop-blur-sm sm:max-w-xl sm:p-8 ${
          isSignupMode ? "md:p-5" : ""
        }`}
      >
        <header className={`mb-5 ${isSignupMode ? "md:mb-3" : ""}`}>
          <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">
            Acceso Calendario Garden
          </h1>
        </header>

        {isLoadingBootstrap ? (
          <div className="space-y-6" aria-busy="true" aria-live="polite">
            <section>
              <p className="mb-3 text-xs font-semibold text-slate-300/75">
                Cargando login...
              </p>
              <LoginFormSkeleton />
            </section>
            <section className="border-t border-white/15 pt-6">
              <p className="mb-3 text-xs font-semibold text-slate-300/75">
                Cargando sign up...
              </p>
              <SignupFormSkeleton />
            </section>
          </div>
        ) : (
          <>
            {mode === "login" ? (
              isSubmitting ? (
                <LoginFormSkeleton />
              ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <label className="block text-sm text-slate-200/90">
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    aria-invalid={emailInputError ? true : undefined}
                    className={`mt-1 w-full rounded-xl border bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 ${
                      emailInputError
                        ? "border-red-500 ring-red-500"
                        : "border-white/25 ring-sky-300/40"
                    }`}
                    placeholder="ejemplo@correo.com"
                    disabled={isSubmitting}
                  />
                  {emailInputError ? (
                    <p className="mt-1 text-xs text-rose-300">{emailInputError}</p>
                  ) : null}
                </label>

                <label className="block text-sm text-slate-200/90">
                  Contraseña
                  <div className="relative mt-1">
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/25 bg-slate-950/45 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-200/85 hover:bg-white/10"
                      aria-label={
                        showLoginPassword
                          ? "Ocultar contraseña de login"
                          : "Ver contraseña de login"
                      }
                      disabled={isSubmitting}
                    >
                      <PasswordVisibilityIcon visible={showLoginPassword} />
                    </button>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset-request");
                    setError(null);
                    setMessage(null);
                    setDevOtpCode(null);
                    resetPasswordRecoveryState();
                  }}
                  className="block text-left text-xs font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  Olvidé mi contraseña
                </button>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !isLoginReady}
                    className="inline-flex w-full justify-center rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
                  </button>
                </div>

                <div className="space-y-2 border-t border-white/15 pt-3">
                  <p className="text-xs text-slate-300/80">
                    No tenés cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setMessage(null);
                        setDevOtpCode(null);
                        resetPasswordRecoveryState();
                      }}
                      className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                    >
                      Crear cuenta (sign up)
                    </button>
                  </p>
                </div>
              </form>
              )
            ) : null}

            {mode === "signup" ? (
              <form
                onSubmit={handleSignupSubmit}
                className="grid gap-3 md:grid-cols-2 md:gap-x-3 md:gap-y-2 md:[&_label]:text-xs md:[&_input]:py-1.5 md:[&_select]:py-1.5"
              >
                <label className="block text-sm text-slate-200/90">
                  Nombre
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    autoComplete="given-name"
                    className="mt-1 w-full rounded-xl border border-white/25 bg-slate-900/55 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2 [&>option]:bg-slate-100 [&>option]:text-slate-900"
                    placeholder="Ej: Maria"
                    disabled={isSubmitting}
                  />
                </label>

                <label className="block text-sm text-slate-200/90">
                  Apellido
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    autoComplete="family-name"
                    className="mt-1 w-full rounded-xl border border-white/25 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2"
                    placeholder="Ej: Perez"
                    disabled={isSubmitting}
                  />
                </label>

                <label className="block text-sm text-slate-200/90">
                  Tipo de personal policial
                  <div className="relative mt-1">
                    <select
                      value={personalType}
                      onChange={(event) => {
                        setPersonalType(event.target.value as SignupPersonalType | "");
                      }}
                      className="w-full appearance-none rounded-xl border border-white/30 bg-[linear-gradient(180deg,rgba(15,23,42,0.62)_0%,rgba(15,23,42,0.45)_100%)] px-3 py-2 pr-10 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] outline-none ring-sky-300/40 transition focus:border-sky-300/60 focus:ring-2 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-slate-900/40 disabled:text-slate-400/65 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                      disabled={isSubmitting}
                    >
                      <option value="" disabled hidden>
                        Elegí un tipo de personal policial
                      </option>
                      {SIGNUP_PERSONAL_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300/90"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-4 w-4"
                      >
                        <path
                          d="M5 8l5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </label>

                <label className="block text-sm text-slate-200/90">
                  Jerarquía
                  <div className="relative mt-1">
                    <select
                      value={hierarchy}
                      onChange={(event) => setHierarchy(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-white/30 bg-[linear-gradient(180deg,rgba(15,23,42,0.62)_0%,rgba(15,23,42,0.45)_100%)] px-3 py-2 pr-10 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] outline-none ring-sky-300/40 transition focus:border-sky-300/60 focus:ring-2 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-slate-900/40 disabled:text-slate-400/65 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                      disabled={
                        isSubmitting ||
                        !requiresHierarchy ||
                        signupHierarchyOptions.length === 0
                      }
                    >
                      <option value="" disabled hidden>
                        {personalType === "Civil"
                          ? "No aplica para personal civil"
                          : personalType.length === 0
                            ? "Elegí primero tipo de personal"
                            : "Elegí una jerarquía"}
                      </option>
                      {signupHierarchyOptions.map((option) => (
                        <option key={option} value={option}>
                          {personalType === "Tecnico" ? `${option} Tecnico` : option}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300/90"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-4 w-4"
                      >
                        <path
                          d="M5 8l5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </label>

                <label className="block text-sm text-slate-200/90">
                  Area
                  <div className="relative mt-1">
                    <select
                      value={area}
                      onChange={(event) => setArea(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-white/30 bg-[linear-gradient(180deg,rgba(15,23,42,0.62)_0%,rgba(15,23,42,0.45)_100%)] px-3 py-2 pr-10 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] outline-none ring-sky-300/40 transition focus:border-sky-300/60 focus:ring-2 disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-slate-900/40 disabled:text-slate-400/65 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                      disabled={isSubmitting}
                    >
                      <option value="" disabled hidden>
                        Elegí un área
                      </option>
                      {SIGNUP_AREA_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300/90"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="h-4 w-4"
                      >
                        <path
                          d="M5 8l5 5 5-5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                </label>

                <label className="block text-sm text-slate-200/90">
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    aria-invalid={emailInputError ? true : undefined}
                    className={`mt-1 w-full rounded-xl border bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 ${
                      emailInputError
                        ? "border-red-500 ring-red-500"
                        : "border-white/25 ring-sky-300/40"
                    }`}
                    placeholder="usuario@correo.com"
                    disabled={isSubmitting}
                  />
                  {emailInputError ? (
                    <p className="mt-1 text-xs text-rose-300">{emailInputError}</p>
                  ) : null}
                </label>

                <label className="block text-sm text-slate-200/90">
                  Contraseña
                  <div className="relative mt-1">
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/25 bg-slate-950/45 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-200/85 hover:bg-white/10"
                      aria-label={
                        showSignupPassword
                          ? "Ocultar contraseña de signup"
                          : "Ver contraseña de signup"
                      }
                      disabled={isSubmitting}
                    >
                      <PasswordVisibilityIcon visible={showSignupPassword} />
                    </button>
                  </div>
                  <div className="mt-3 grid w-full grid-cols-4 gap-1">
                    {Array.from({ length: 4 }).map((_, index) => {
                      const isActive = index < signupPasswordMeterLevel;
                      return (
                        <span
                          key={`password-meter-${index}`}
                          className={`h-1.5 rounded-sm border transition-colors ${
                            isActive
                              ? signupPasswordMeterColorClass
                              : "border-white/15 bg-white/10"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs leading-tight">
                    <li
                      className={
                        signupPasswordChecks.hasMinLength
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {signupPasswordChecks.hasMinLength ? "\u2713" : "\u2022"} Mas de 6
                      caracteres
                    </li>
                    <li
                      className={
                        signupPasswordChecks.hasUppercase
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {signupPasswordChecks.hasUppercase ? "\u2713" : "\u2022"} Al menos una
                      mayúscula
                    </li>
                    <li
                      className={
                        signupPasswordChecks.hasNumber
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {signupPasswordChecks.hasNumber ? "\u2713" : "\u2022"} Al menos un
                      número
                    </li>
                    <li
                      className={
                        signupPasswordChecks.hasSpecialChar
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {signupPasswordChecks.hasSpecialChar ? "\u2713" : "\u2022"} Al menos un
                      carácter especial
                    </li>
                  </ul>
                </label>

                <label className="block text-sm text-slate-200/90">
                  Confirmar contraseña
                  <div className="relative mt-1">
                    <input
                      type={showSignupConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/25 bg-slate-950/45 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2"
                      disabled={isSubmitting}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowSignupConfirmPassword((value) => !value)
                      }
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-200/85 hover:bg-white/10"
                      aria-label={
                        showSignupConfirmPassword
                          ? "Ocultar confirmación de contraseña"
                          : "Ver confirmación de contraseña"
                      }
                      disabled={isSubmitting}
                    >
                      <PasswordVisibilityIcon
                        visible={showSignupConfirmPassword}
                      />
                    </button>
                  </div>
                  {confirmPassword.length > 0 ? (
                    <p
                      className={`mt-1 text-xs ${
                        isSignupPasswordConfirmed ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {isSignupPasswordConfirmed
                        ? "✓ Las contraseñas coinciden"
                        : "• Las contraseñas no coinciden"}
                    </p>
                  ) : null}
                </label>

                <div className="pt-1 md:col-span-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !isSignupReady}
                    className="relative inline-flex w-full justify-center overflow-hidden rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <span
                        aria-hidden="true"
                        className="signup-submit-progress"
                      />
                    ) : null}
                    <span className="relative z-10">
                      {isSubmitting
                        ? "Creando..."
                        : bootstrapOpen
                          ? "Sign up"
                          : "Crear cuenta"}
                    </span>
                  </button>
                </div>

                <p className="text-xs text-slate-300/80 md:col-span-2">
                  Ya tengo cuenta.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                      setMessage(null);
                      setDevOtpCode(null);
                      resetPasswordRecoveryState();
                    }}
                    className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                  >
                    Ir a login
                  </button>
                </p>
              </form>
            ) : null}

            {mode === "reset-request" ? (
              <form onSubmit={handleRequestPasswordResetSubmit} className="space-y-4">
                <p className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-100/90">
                  Te enviaremos un código para validar el cambio de contraseña.
                </p>

                <label className="block text-sm text-slate-200/90">
                  E-mail
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    aria-invalid={emailInputError ? true : undefined}
                    className={`mt-1 w-full rounded-xl border bg-slate-950/45 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 ${
                      emailInputError
                        ? "border-red-500 ring-red-500"
                        : "border-white/25 ring-sky-300/40"
                    }`}
                    placeholder="ejemplo@correo.com"
                    disabled={isSubmitting}
                  />
                  {emailInputError ? (
                    <p className="mt-1 text-xs text-rose-300">{emailInputError}</p>
                  ) : null}
                </label>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !isEmailValid}
                    className="inline-flex rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Enviando..." : "Enviar código"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                      setMessage(null);
                      setDevOtpCode(null);
                      resetPasswordRecoveryState();
                    }}
                    className="inline-flex rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold text-slate-100/90 transition hover:bg-white/10"
                  >
                    Volver a login
                  </button>
                </div>
              </form>
            ) : null}

            {mode === "reset-verify" ? (
              <form
                ref={resetVerifyFormRef}
                onSubmit={
                  isResetOtpValidated
                    ? handleResetPasswordSubmit
                    : handleValidateResetOtpSubmit
                }
                className="space-y-4"
              >
                <p className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-100/90">
                  Recuperación para:{" "}
                  <span className="font-semibold text-slate-50 break-all">
                    {pendingResetEmail ?? email}
                  </span>
                </p>

                <label className="block text-sm text-slate-200/90">
                  Código OTP (6 dígitos)
                  <OtpDigitInput
                    idPrefix="reset-otp"
                    value={resetOtpCode}
                    onChange={setResetOtpCode}
                    disabled={isSubmitting}
                  />
                </label>

                {!isResetOtpValidated ? (
                  <p className="text-xs text-slate-300/75">
                    Valida primero el código OTP para habilitar la nueva contraseña.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-300">
                    Código validado. Ya puedes definir tu nueva contraseña.
                  </p>
                )}

                <label className="block text-sm text-slate-200/90">
                  Nueva contraseña
                  <div className="relative mt-1">
                    <input
                      type={showResetPassword ? "text" : "password"}
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                      autoComplete="new-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/25 bg-slate-950/45 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2"
                      disabled={isSubmitting || !isResetOtpValidated}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-200/85 hover:bg-white/10"
                      aria-label={
                        showResetPassword
                          ? "Ocultar nueva contraseña"
                          : "Ver nueva contraseña"
                      }
                      disabled={isSubmitting || !isResetOtpValidated}
                    >
                      <PasswordVisibilityIcon visible={showResetPassword} />
                    </button>
                  </div>
                  <div className="mt-3 grid w-full grid-cols-4 gap-1">
                    {Array.from({ length: 4 }).map((_, index) => {
                      const isActive = index < resetPasswordRulesCompleted;
                      return (
                        <span
                          key={`reset-password-meter-${index}`}
                          className={`h-1.5 rounded-sm border transition-colors ${
                            isActive
                              ? resetPasswordMeterColorClass
                              : "border-white/15 bg-white/10"
                          }`}
                        />
                      );
                    })}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    <li
                      className={
                        resetPasswordChecks.hasMinLength
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {resetPasswordChecks.hasMinLength ? "\u2713" : "\u2022"} Mas de 6
                      caracteres
                    </li>
                    <li
                      className={
                        resetPasswordChecks.hasUppercase
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {resetPasswordChecks.hasUppercase ? "\u2713" : "\u2022"} Al menos una
                      mayúscula
                    </li>
                    <li
                      className={
                        resetPasswordChecks.hasNumber
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {resetPasswordChecks.hasNumber ? "\u2713" : "\u2022"} Al menos un
                      número
                    </li>
                    <li
                      className={
                        resetPasswordChecks.hasSpecialChar
                          ? "text-emerald-300"
                          : "text-slate-300/75"
                      }
                    >
                      {resetPasswordChecks.hasSpecialChar ? "\u2713" : "\u2022"} Al menos un
                      carácter especial
                    </li>
                  </ul>
                </label>

                <label className="block text-sm text-slate-200/90">
                  Confirmar nueva contraseña
                  <div className="relative mt-1">
                    <input
                      type={showResetConfirmPassword ? "text" : "password"}
                      value={resetConfirmPassword}
                      onChange={(event) => setResetConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      className="hide-password-reveal w-full rounded-xl border border-white/25 bg-slate-950/45 px-3 py-2 pr-12 text-sm text-slate-100 outline-none ring-sky-300/40 focus:ring-2"
                      disabled={isSubmitting || !isResetOtpValidated}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowResetConfirmPassword((value) => !value)
                      }
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-200/85 hover:bg-white/10"
                      aria-label={
                        showResetConfirmPassword
                          ? "Ocultar confirmación de nueva contraseña"
                          : "Ver confirmación de nueva contraseña"
                      }
                      disabled={isSubmitting || !isResetOtpValidated}
                    >
                      <PasswordVisibilityIcon visible={showResetConfirmPassword} />
                    </button>
                  </div>
                  {resetConfirmPassword.length > 0 ? (
                    <p
                      className={`mt-2 text-xs ${
                        isResetPasswordConfirmed ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {isResetPasswordConfirmed
                        ? "Las contraseñas coinciden"
                        : "Las contraseñas no coinciden"}
                    </p>
                  ) : null}
                </label>

                <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      (isResetOtpValidated ? !isResetPasswordReady : !isResetOtpReady)
                    }
                    className="inline-flex justify-center rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting
                      ? isResetOtpValidated
                        ? "Guardando..."
                        : "Validando..."
                      : isResetOtpValidated
                        ? "Cambiar contraseña"
                        : "Validar código"}
                  </button>
                  <button
                    type="button"
                    disabled={isResendingOtp || resetOtpCooldownSeconds > 0}
                    onClick={() => {
                      void handleResendPasswordResetOtp();
                    }}
                    className="inline-flex justify-center rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold text-slate-100/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResendingOtp
                      ? "Enviando..."
                      : resetOtpCooldownSeconds > 0
                        ? `Reenviar en ${resetOtpCooldownSeconds}s`
                        : "Reenviar código"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                      setMessage(null);
                      setDevOtpCode(null);
                      resetPasswordRecoveryState();
                    }}
                    className="inline-flex justify-center rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold text-slate-100/90 transition hover:bg-white/10"
                  >
                    Volver a login
                  </button>
                </div>
              </form>
            ) : null}

            {mode === "verify" ? (
              <form
                ref={verifyFormRef}
                onSubmit={handleVerifyOtpSubmit}
                className="space-y-4"
              >
                <p className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-100/90">
                  Verificación pendiente para:{" "}
                  <span className="font-semibold text-slate-50 break-all">
                    {pendingEmail ?? email}
                  </span>
                </p>

                <label className="block text-sm text-slate-200/90">
                  Código OTP (6 dígitos)
                  <OtpDigitInput
                    idPrefix="verify-otp"
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={isSubmitting}
                  />
                </label>

                <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
                  <button
                    type="submit"
                    disabled={isSubmitting || otpCode.length !== OTP_LENGTH}
                    className="inline-flex justify-center rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "Verificando..." : "Validar código"}
                  </button>
                  <button
                    type="button"
                    disabled={isResendingOtp || verifyOtpCooldownSeconds > 0}
                    onClick={() => {
                      void handleResendOtp();
                    }}
                    className="inline-flex justify-center rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold text-slate-100/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isResendingOtp
                      ? "Enviando..."
                      : verifyOtpCooldownSeconds > 0
                        ? `Reenviar en ${verifyOtpCooldownSeconds}s`
                        : "Reenviar código"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setPendingEmail(null);
                      setOtpCode("");
                      setDevOtpCode(null);
                      resetPasswordRecoveryState();
                    }}
                    className="inline-flex justify-center rounded-full border border-white/25 bg-white/10 px-5 py-2 text-sm font-semibold text-slate-100/90 transition hover:bg-white/10"
                  >
                    Volver a login
                  </button>
                </div>
              </form>
            ) : null}
          </>
        )}

        {devOtpCode ? (
          <p className="mt-4 rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-sm text-amber-100">
            Código OTP (modo desarrollo):{" "}
            <span className="break-all font-semibold tracking-[0.2em]">
              {devOtpCode}
            </span>
          </p>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-xl border border-emerald-300/40 bg-emerald-400/15 px-3 py-2 text-sm text-emerald-100">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-300/40 bg-rose-400/15 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

      </div>
    </main>
  );
}










