"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { dispatchBirthdaysUpdated } from "@/lib/birthdays";

type PersonalCategory = "Policial" | "Civil" | "Gobierno";
type PolicialRole = "Oficial" | "Suboficial" | "Tecnico" | "Civil";
type SelectedPolicialRole = PolicialRole | "";
type OficialCategory =
  | "Oficial Ayudante"
  | "Oficial Subinspector"
  | "Oficial Inspector"
  | "Oficial Principal"
  | "Subcomisario"
  | "Comisario"
  | "Comisario Inspector"
  | "Comisario Mayor"
  | "Comisario General";
type SuboficialCategory =
  | "Agente"
  | "Cabo"
  | "Cabo Primero"
  | "Sargento"
  | "Sargento Primero"
  | "Sargento Ayudante"
  | "Suboficial Principal"
  | "Suboficial Mayor";

const AREA_CATEGORIES = [
  "D.M.C.A (Dirección Monitoreo Cordobeses en Alerta)",
  "Departamento Alerta Ciudadana",
  "Departamento Socio-Educativo",
] as const;
type AreaCategory = (typeof AREA_CATEGORIES)[number];

const TURNO_CATEGORIES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "Administrativo",
  "Full Time",
  "Guardia larga",
  "Superior de Turno",
] as const;
type TurnoCategory = (typeof TURNO_CATEGORIES)[number];

type PersonalInfo =
  | {
      category: "Civil";
    }
  | {
      category: "Gobierno";
    }
  | {
      category: "Policial";
      policial: PolicialRole;
      oficialCategory?: OficialCategory;
      suboficialCategory?: SuboficialCategory;
    };

type ApiErrorResponse = {
  error: string;
};

type BirthdayCreatePayload = {
  firstName: string;
  lastName: string;
  birthDate: string;
  area: AreaCategory | null;
  turno: TurnoCategory | null;
  personal: PersonalInfo;
};

type PendingCreateState = {
  fullName: string;
  payload: BirthdayCreatePayload;
};

type CreateBirthdayEventButtonProps = {
  buttonClassName?: string;
  label?: string;
  onCreated?: () => void;
};

const PERSONAL_CATEGORIES: PersonalCategory[] = ["Policial", "Civil", "Gobierno"];
const POLICIAL_ROLES: PolicialRole[] = [
  "Oficial",
  "Suboficial",
  "Tecnico",
  "Civil",
];
const OFICIAL_CATEGORIES: OficialCategory[] = [
  "Oficial Ayudante",
  "Oficial Subinspector",
  "Oficial Inspector",
  "Oficial Principal",
  "Subcomisario",
  "Comisario",
  "Comisario Inspector",
  "Comisario Mayor",
  "Comisario General",
];
const SUBOFICIAL_CATEGORIES: SuboficialCategory[] = [
  "Agente",
  "Cabo",
  "Cabo Primero",
  "Sargento",
  "Sargento Primero",
  "Sargento Ayudante",
  "Suboficial Principal",
  "Suboficial Mayor",
];

const NOTICE_AUTO_DISMISS_MS = 15_000;
const NOTICE_ANIMATION_MS = 300;

function formatPolicialRoleLabel(role: PolicialRole) {
  return role === "Tecnico" ? "Técnico" : role;
}

function formatSuboficialCategoryLabel(
  category: SuboficialCategory,
  role: PolicialRole
) {
  return role === "Tecnico" ? `${category} Técnico` : category;
}

function SelectChevron() {
  return (
    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-300/70">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="m5.5 7.5 4.5 5 4.5-5" />
      </svg>
    </span>
  );
}

function BirthdayFormSkeleton() {
  return (
    <div className="mt-5 space-y-4" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
          <div className="auth-skeleton h-3 w-16 rounded" />
          <div className="auth-skeleton mt-2 h-9 w-full rounded" />
        </div>
        <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
          <div className="auth-skeleton h-3 w-20 rounded" />
          <div className="auth-skeleton mt-2 h-9 w-full rounded" />
        </div>
      </div>
      <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
        <div className="auth-skeleton h-3 w-20 rounded" />
        <div className="auth-skeleton mt-2 h-9 w-full rounded" />
      </div>
      <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
        <div className="auth-skeleton h-3 w-24 rounded" />
        <div className="auth-skeleton mt-2 h-9 w-full rounded" />
      </div>
      <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
        <div className="auth-skeleton h-3 w-32 rounded" />
        <div className="auth-skeleton mt-2 h-9 w-full rounded" />
      </div>
      <div className="auth-skeleton h-10 w-44 rounded-full" />
      <p className="text-sm text-slate-300/85">Guardando cumpleaños en Garden DB...</p>
    </div>
  );
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function sanitizePersonNameInput(value: string) {
  return value
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ");
}

function normalizePersonName(value: string) {
  return sanitizePersonNameInput(value).trim();
}

export default function CreateBirthdayEventButton({
  buttonClassName,
  label = "Cargar evento",
  onCreated,
}: CreateBirthdayEventButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [areaCategory, setAreaCategory] = useState<AreaCategory | "">("");
  const [turnoCategory, setTurnoCategory] = useState<TurnoCategory | "">("");
  const [personalCategory, setPersonalCategory] =
    useState<PersonalCategory>("Policial");
  const [policialRole, setPolicialRole] = useState<SelectedPolicialRole>("");
  const [oficialCategory, setOficialCategory] = useState<OficialCategory>(
    OFICIAL_CATEGORIES[0]
  );
  const [suboficialCategory, setSuboficialCategory] =
    useState<SuboficialCategory>(SUBOFICIAL_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isNoticeVisible, setIsNoticeVisible] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<PendingCreateState | null>(
    null
  );
  const [isPortalReady, setIsPortalReady] = useState(false);
  const noticeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeNotice = error
    ? { tone: "error" as const, text: error }
    : message
      ? { tone: "success" as const, text: message }
      : null;

  useEffect(() => {
    setIsPortalReady(true);

    return () => {
      setIsPortalReady(false);
    };
  }, []);

  useEffect(() => {
    if (!error && !message) {
      setIsNoticeVisible(false);
      if (noticeHideTimerRef.current) {
        clearTimeout(noticeHideTimerRef.current);
        noticeHideTimerRef.current = null;
      }
      if (noticeCleanupTimerRef.current) {
        clearTimeout(noticeCleanupTimerRef.current);
        noticeCleanupTimerRef.current = null;
      }
      return;
    }

    setIsNoticeVisible(true);

    if (noticeHideTimerRef.current) {
      clearTimeout(noticeHideTimerRef.current);
    }
    if (noticeCleanupTimerRef.current) {
      clearTimeout(noticeCleanupTimerRef.current);
    }

    noticeHideTimerRef.current = setTimeout(() => {
      setIsNoticeVisible(false);
      noticeCleanupTimerRef.current = setTimeout(() => {
        setError(null);
        setMessage(null);
      }, NOTICE_ANIMATION_MS);
    }, NOTICE_AUTO_DISMISS_MS);

    return () => {
      if (noticeHideTimerRef.current) {
        clearTimeout(noticeHideTimerRef.current);
        noticeHideTimerRef.current = null;
      }
      if (noticeCleanupTimerRef.current) {
        clearTimeout(noticeCleanupTimerRef.current);
        noticeCleanupTimerRef.current = null;
      }
    };
  }, [error, message]);

  useEffect(() => {
    if (personalCategory !== "Gobierno") {
      return;
    }

    setAreaCategory("");
    setTurnoCategory("");
  }, [personalCategory]);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setBirthDate("");
    setAreaCategory("");
    setTurnoCategory("");
    setPersonalCategory("Policial");
    setPolicialRole("");
    setOficialCategory(OFICIAL_CATEGORIES[0]);
    setSuboficialCategory(SUBOFICIAL_CATEGORIES[0]);
  }

  function openModal() {
    setIsOpen(true);
    setError(null);
    setMessage(null);
    setPendingCreate(null);
  }

  function closeModal() {
    if (isSaving) {
      return;
    }
    setIsOpen(false);
    setPendingCreate(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = normalizePersonName(firstName);
    const cleanLastName = normalizePersonName(lastName);
    const requiresAreaAndTurno = personalCategory !== "Gobierno";
    const selectedArea = requiresAreaAndTurno ? areaCategory : null;
    const selectedTurno = requiresAreaAndTurno ? turnoCategory : null;

    if (!cleanName || !cleanLastName || !birthDate) {
      setError("Completá nombre, apellido y fecha de nacimiento.");
      setMessage(null);
      return;
    }

    if (requiresAreaAndTurno && (!selectedArea || !selectedTurno)) {
      setError("Completá área y turno.");
      setMessage(null);
      return;
    }

    if (personalCategory === "Policial" && !policialRole) {
      setError("Seleccioná un tipo de personal policial.");
      setMessage(null);
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    if (birthDate > todayIso) {
      setError("La fecha de nacimiento no puede ser futura.");
      setMessage(null);
      return;
    }

    const personal: PersonalInfo =
      personalCategory === "Policial"
        ? {
            category: "Policial",
            policial: policialRole as PolicialRole,
            oficialCategory:
              policialRole === "Oficial" ? oficialCategory : undefined,
            suboficialCategory:
              policialRole === "Suboficial" || policialRole === "Tecnico"
                ? suboficialCategory
                : undefined,
          }
        : personalCategory === "Gobierno"
          ? {
              category: "Gobierno",
            }
          : {
              category: "Civil",
            };

    setPendingCreate({
      fullName: `${cleanLastName}, ${cleanName}`,
      payload: {
        firstName: cleanName,
        lastName: cleanLastName,
        birthDate,
        area: selectedArea as AreaCategory | null,
        turno: selectedTurno as TurnoCategory | null,
        personal,
      },
    });
    setError(null);
    setMessage(null);
  }

  async function confirmCreateEvent() {
    if (!pendingCreate) {
      return;
    }

    const payload = pendingCreate.payload;
    setPendingCreate(null);
    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/birthdays", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as
        | { data?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo cargar el evento en la base de datos."
        );
      }

      dispatchBirthdaysUpdated();
      resetForm();
      setError(null);
      setMessage("Evento cargado con éxito.");
      if (onCreated) {
        onCreated();
      }
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al cargar evento en la base de datos.";
      setError(detail);
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  function cancelCreateConfirmation() {
    if (isSaving) {
      return;
    }

    setPendingCreate(null);
  }

  const resolvedButtonClassName =
    buttonClassName ??
    "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-sky-300/35 bg-sky-400/28 px-4 text-sm font-semibold text-sky-100 shadow-[0_10px_24px_rgba(2,8,23,0.28)] transition hover:bg-sky-400/36 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60";
  const isGovernmentPersonal = personalCategory === "Gobierno";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={resolvedButtonClassName}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4 shrink-0"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8.5v7" />
          <path d="M8.5 12h7" />
        </svg>
        <span>{label}</span>
      </button>

      {isPortalReady && isOpen ? createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-[1.5px]">
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-sky-200/20 bg-[linear-gradient(140deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.78)_100%)] p-6 text-slate-100 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-md">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-sky-300/18 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-20 -bottom-24 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl"
            />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-100">
                  Cargar evento del personal
                </h2>
                <p className="mt-1 text-sm text-slate-300/85">
                  Agregá nombre, apellido, categoría de personal, área, turno y
                  fecha de nacimiento.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={isSaving}
                aria-label="Cerrar formulario"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/25 bg-slate-800/65 text-slate-100 transition hover:bg-slate-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-4 w-4"
                >
                  <path d="M5 5 15 15" />
                  <path d="M15 5 5 15" />
                </svg>
              </button>
            </div>

            {isSaving ? (
              <BirthdayFormSkeleton />
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-200/90">
                    Nombre
                    <input
                      type="text"
                      value={firstName}
                      onChange={(event) =>
                        setFirstName(sanitizePersonNameInput(event.target.value))
                      }
                      className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                      placeholder="Ej: María"
                    />
                  </label>

                  <label className="text-sm text-slate-200/90">
                    Apellido
                    <input
                      type="text"
                      value={lastName}
                      onChange={(event) =>
                        setLastName(sanitizePersonNameInput(event.target.value))
                      }
                      className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                      placeholder="Ej: Pérez"
                    />
                  </label>
                </div>

                <label className="block text-sm text-slate-200/90">
                  Personal
                  <div className="relative mt-1">
                    <select
                      value={personalCategory}
                      onChange={(event) =>
                        setPersonalCategory(event.target.value as PersonalCategory)
                      }
                      className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                    >
                      {PERSONAL_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </label>

                {personalCategory === "Policial" ? (
                  <label className="block text-sm text-slate-200/90">
                    Tipo de personal policial
                    <div className="relative mt-1">
                      <select
                        value={policialRole}
                        onChange={(event) =>
                          setPolicialRole(event.target.value as SelectedPolicialRole)
                        }
                        required
                        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                      >
                        <option value="" disabled hidden>
                          Elegí tipo de personal policial
                        </option>
                        {POLICIAL_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {formatPolicialRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                      <SelectChevron />
                    </div>
                  </label>
                ) : null}

                {personalCategory === "Policial" && policialRole === "Oficial" ? (
                  <label className="block text-sm text-slate-200/90">
                    Categoría de oficial
                    <div className="relative mt-1">
                      <select
                        value={oficialCategory}
                        onChange={(event) =>
                          setOficialCategory(event.target.value as OficialCategory)
                        }
                        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                      >
                        {OFICIAL_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <SelectChevron />
                    </div>
                  </label>
                ) : null}

                {personalCategory === "Policial" &&
                (policialRole === "Suboficial" || policialRole === "Tecnico") ? (
                  <label className="block text-sm text-slate-200/90">
                    {policialRole === "Tecnico"
                      ? "Categoría de técnico"
                      : "Categoría de suboficial"}
                    <div className="relative mt-1">
                      <select
                        value={suboficialCategory}
                        onChange={(event) =>
                          setSuboficialCategory(
                            event.target.value as SuboficialCategory
                          )
                        }
                        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                      >
                        {SUBOFICIAL_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {formatSuboficialCategoryLabel(category, policialRole)}
                          </option>
                        ))}
                      </select>
                      <SelectChevron />
                    </div>
                  </label>
                ) : null}

                <label className="block text-sm text-slate-200/90">
                  Área
                  <div className="relative mt-1">
                    <select
                      value={areaCategory}
                      onChange={(event) =>
                        setAreaCategory(event.target.value as AreaCategory | "")
                      }
                      required={!isGovernmentPersonal}
                      disabled={isGovernmentPersonal}
                      className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                    >
                      {isGovernmentPersonal ? (
                        <option value="">No aplica para Gobierno</option>
                      ) : (
                        <option value="" disabled hidden>
                          Elegí un área
                        </option>
                      )}
                      {AREA_CATEGORIES.map((area) => (
                        <option key={area} value={area}>
                          {area}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </label>

                <label className="block text-sm text-slate-200/90">
                  Turno
                  <div className="relative mt-1">
                    <select
                      value={turnoCategory}
                      onChange={(event) =>
                        setTurnoCategory(event.target.value as TurnoCategory | "")
                      }
                      required={!isGovernmentPersonal}
                      disabled={isGovernmentPersonal}
                      className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                    >
                      {isGovernmentPersonal ? (
                        <option value="">No aplica para Gobierno</option>
                      ) : (
                        <option value="" disabled hidden>
                          Elegí un turno
                        </option>
                      )}
                      {TURNO_CATEGORIES.map((turno) => (
                        <option key={turno} value={turno}>
                          {turno}
                        </option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </label>

                <label className="block text-sm text-slate-200/90">
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                  />
                </label>

                <button
                  type="submit"
                  className="inline-flex rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cargar evento
                </button>
              </form>
            )}

            {activeNotice ? (
              <p
                className={`mt-4 rounded-xl px-4 py-3 text-sm transition-all duration-300 ease-out ${
                  activeNotice.tone === "success"
                    ? "border border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                    : "border border-red-300/30 bg-red-400/15 text-red-100"
                } ${
                  isNoticeVisible
                    ? "translate-y-0 opacity-100"
                    : "-translate-y-1 opacity-0"
                }`}
              >
                {activeNotice.text}
              </p>
            ) : null}

            {pendingCreate ? (
              <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[1.5px]">
                <div className="w-full max-w-md rounded-2xl border border-sky-200/20 bg-[linear-gradient(140deg,rgba(15,23,42,0.9)_0%,rgba(15,23,42,0.78)_100%)] p-5 text-slate-100 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-md">
                  <h3 className="text-lg font-bold text-slate-100">
                    Confirmar carga de evento
                  </h3>
                  <p className="mt-2 text-sm text-slate-300/85">
                    Se cargará el evento para{" "}
                    <span className="font-semibold text-slate-100">
                      {pendingCreate.fullName}
                    </span>
                    . ¿Deseás continuar?
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={cancelCreateConfirmation}
                      disabled={isSaving}
                      className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void confirmCreateEvent();
                      }}
                      disabled={isSaving}
                      className="inline-flex rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Cargando..." : "Sí, cargar evento"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}



