"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ExitClientModeButton from "@/components/ExitClientModeButton";
import CreateBirthdayEventButton from "@/components/CreateBirthdayEventButton";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";
import UserNavbar from "@/components/UserNavbar";
import { dispatchBirthdaysUpdated } from "@/lib/birthdays";

type PersonalCategory = "Policial" | "Civil" | "Gobierno";
type PolicialRole = "Oficial" | "Suboficial" | "Tecnico" | "Civil";
type SelectedPolicialRole = PolicialRole | "";
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
      oficialCategory?: string;
      suboficialCategory?: string;
    };

type BirthdayRecord = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  area?: string;
  turno?: string;
  personal: PersonalInfo;
};

type ApiErrorResponse = {
  error: string;
};

type ApiDataResponse = {
  data?: unknown;
};

type ApiPaginationResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ApiListResponse = {
  data?: unknown;
  pagination?: unknown;
};

type SessionViewResponse = {
  authenticated?: boolean;
  canExitClientMode?: boolean;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  } | null;
  permissions?: {
    canAccessAnnualDashboard?: boolean;
    canReadPersonalCargado?: boolean;
    canManagePersonalCargado?: boolean;
  } | null;
};

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "primary";
};

type DownloadPreviewInfo = {
  totalMatches: number;
  fileName: string;
};

const PERSONAL_CATEGORIES: PersonalCategory[] = ["Policial", "Civil", "Gobierno"];
const POLICIAL_ROLES: PolicialRole[] = [
  "Oficial",
  "Suboficial",
  "Tecnico",
  "Civil",
];
const OFICIAL_CATEGORIES = [
  "Oficial Ayudante",
  "Oficial Subinspector",
  "Oficial Inspector",
  "Oficial Principal",
  "Subcomisario",
  "Comisario",
  "Comisario Inspector",
  "Comisario Mayor",
  "Comisario General",
] as const;
const SUBOFICIAL_CATEGORIES = [
  "Agente",
  "Cabo",
  "Cabo Primero",
  "Sargento",
  "Sargento Primero",
  "Sargento Ayudante",
  "Suboficial Principal",
  "Suboficial Mayor",
] as const;
const AREA_CATEGORIES = [
  "D.M.C.A (Dirección Monitoreo Cordobeses en Alerta)",
  "Departamento Alerta Ciudadana",
  "Departamento Socio-Educativo",
] as const;
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
const NOTICE_AUTO_DISMISS_MS = 15_000;
const NOTICE_ANIMATION_MS = 300;
const RECORDS_PER_PAGE = 15;
const SEARCH_HISTORY_KEY = "personal-cargado-search-history-v1";
const SEARCH_HISTORY_LIMIT = 5;
const FILTERS_STORAGE_KEY = "personal-cargado-filters-v1";
const FILTER_MENU_OFFSET_PX = 6;
const FILTER_MENU_VIEWPORT_MARGIN_PX = 16;
const FILTER_MENU_MIN_HEIGHT_BELOW_PX = 240;
type OficialCategory = (typeof OFICIAL_CATEGORIES)[number];
type SuboficialCategory = (typeof SUBOFICIAL_CATEGORIES)[number];
type NameOrder = "asc" | "desc";
type DateFilterMode =
  | "thisMonth"
  | "thisWeek"
  | "monthRange"
  | "yearRange"
  | "dateRange"
  | "monthDayRange";
type PersonnelFilters = {
  personalCategory: PersonalCategory | "";
  policialRole: PolicialRole | "";
  area: string;
  turno: string;
  nameOrder: NameOrder | "";
  dateFilterMode: DateFilterMode | "";
  monthFrom: string;
  monthTo: string;
  yearFrom: string;
  yearTo: string;
  dateFrom: string;
  dateTo: string;
  dayMonthFrom: string;
  dayMonthTo: string;
};
const EMPTY_FILTERS: PersonnelFilters = {
  personalCategory: "",
  policialRole: "",
  area: "",
  turno: "",
  nameOrder: "",
  dateFilterMode: "",
  monthFrom: "",
  monthTo: "",
  yearFrom: "",
  yearTo: "",
  dateFrom: "",
  dateTo: "",
  dayMonthFrom: "",
  dayMonthTo: "",
};
const BIRTH_MONTH_OPTIONS = [
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
] as const;

function formatBirthDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function isBirthdayToday(isoDate: string) {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const today = new Date();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  return parts[1] === todayMonth && parts[2] === todayDay;
}

function formatPolicialRoleLabel(role: PolicialRole) {
  return role === "Tecnico" ? "Técnico" : role;
}

function formatSuboficialCategoryLabel(category: string, role: PolicialRole) {
  return role === "Tecnico" ? `${category} Técnico` : category;
}

function normalizeInputText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
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

function normalizeBirthMonthInput(value: string) {
  const normalized = normalizeInputText(value);
  const month = Number(normalized);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return "";
  }

  return String(month);
}

function normalizeYearInput(value: string) {
  const normalized = normalizeInputText(value);
  if (!/^\d{1,4}$/.test(normalized)) {
    return "";
  }

  const year = Number(normalized);
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    return "";
  }

  return String(year);
}

function normalizeIsoDateInput(value: string) {
  const normalized = normalizeInputText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  const [yearRaw, monthRaw, dayRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return "";
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return "";
  }

  return `${yearRaw}-${monthRaw}-${dayRaw}`;
}

function getDaysInMonth(month: number) {
  return new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

function normalizeDayMonthInput(value: string) {
  let normalized = normalizeInputText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = normalized.slice(5);
  }

  if (!/^\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  const [monthRaw, dayRaw] = normalized.split("-");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }

  if (month < 1 || month > 12) {
    return "";
  }

  const maxDay = getDaysInMonth(month);
  if (day < 1 || day > maxDay) {
    return "";
  }

  return `${monthRaw}-${dayRaw}`;
}

function buildDayMonthToken(monthValue: string, dayValue: string) {
  const month = Number(monthValue);
  if (!Number.isInteger(month)) {
    return "";
  }

  if (month < 1 || month > 12) {
    return "";
  }

  if (dayValue === "") {
    return `${String(month).padStart(2, "0")}-`;
  }

  const day = Number(dayValue);
  if (!Number.isInteger(day)) {
    return "";
  }

  const maxDay = getDaysInMonth(month);
  if (day < 1 || day > maxDay) {
    return "";
  }

  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitDayMonthToken(value: string) {
  const raw = normalizeInputText(value);
  if (!raw) {
    return {
      month: "",
      day: "",
    };
  }

  if (/^\d{2}-$/.test(raw)) {
    const monthRaw = raw.slice(0, 2);
    const month = Number(monthRaw);
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      return {
        month: String(month),
        day: "",
      };
    }

    return {
      month: "",
      day: "",
    };
  }

  const normalized = normalizeDayMonthInput(raw);
  if (!normalized) {
    return {
      month: "",
      day: "",
    };
  }

  const [monthRaw, dayRaw] = normalized.split("-");
  return {
    month: String(Number(monthRaw)),
    day: String(Number(dayRaw)),
  };
}

function buildDayOptions(monthValue: string) {
  const month = Number(monthValue);
  const totalDays =
    Number.isInteger(month) && month >= 1 && month <= 12
      ? getDaysInMonth(month)
      : 31;
  return Array.from({ length: totalDays }, (_, index) => String(index + 1));
}

function toDayMonthToken(value: string) {
  return normalizeDayMonthInput(value);
}

function formatDayMonthTokenForDisplay(value: string) {
  const normalized = normalizeDayMonthInput(value);
  if (!normalized) {
    return "";
  }

  const [monthRaw, dayRaw] = normalized.split("-");
  return `${dayRaw}/${monthRaw}`;
}

function isCrossYearDayMonthRange(fromValue: string, toValue: string) {
  const from = normalizeDayMonthInput(fromValue);
  const to = normalizeDayMonthInput(toValue);
  if (!from || !to) {
    return false;
  }

  return from > to;
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

function asOficialCategory(value: string | undefined): OficialCategory {
  if (value && OFICIAL_CATEGORIES.includes(value as OficialCategory)) {
    return value as OficialCategory;
  }

  return OFICIAL_CATEGORIES[0];
}

function asSuboficialCategory(value: string | undefined): SuboficialCategory {
  if (value && SUBOFICIAL_CATEGORIES.includes(value as SuboficialCategory)) {
    return value as SuboficialCategory;
  }

  return SUBOFICIAL_CATEGORIES[0];
}

function isApiError(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBirthdayRecord(item: unknown): BirthdayRecord | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }

  const parsed = item as Record<string, unknown>;
  const id = asNonEmptyString(parsed.id);
  const firstName = asNonEmptyString(parsed.firstName);
  const lastName = asNonEmptyString(parsed.lastName);
  const birthDate = asNonEmptyString(parsed.birthDate);

  if (!id || !firstName || !lastName || !birthDate) {
    return null;
  }

  const personalObject =
    typeof parsed.personal === "object" && parsed.personal !== null
      ? (parsed.personal as Record<string, unknown>)
      : null;
  const categoryRaw = asNonEmptyString(personalObject?.category);

  const personal: PersonalInfo =
    categoryRaw === "Policial"
      ? {
          category: "Policial",
          policial: (
            asNonEmptyString(personalObject?.policial) ?? "Civil"
          ) as PolicialRole,
          oficialCategory: asNonEmptyString(personalObject?.oficialCategory) ?? undefined,
          suboficialCategory:
            asNonEmptyString(personalObject?.suboficialCategory) ?? undefined,
        }
      : categoryRaw === "Gobierno"
        ? {
            category: "Gobierno",
          }
        : {
            category: "Civil",
          };

  return {
    id,
    firstName,
    lastName,
    birthDate,
    area: asNonEmptyString(parsed.area) ?? undefined,
    turno: asNonEmptyString(parsed.turno) ?? undefined,
    personal,
  };
}

function normalizePagination(value: unknown): ApiPaginationResponse | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const page = Number(parsed.page);
  const pageSize = Number(parsed.pageSize);
  const total = Number(parsed.total);
  const totalPages = Number(parsed.totalPages);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 0 ||
    !Number.isInteger(total) ||
    total < 0 ||
    !Number.isInteger(totalPages) ||
    totalPages < 0
  ) {
    return null;
  }

  return {
    page,
    pageSize,
    total,
    totalPages,
  };
}

function buildPaginationItems(totalPages: number, currentPage: number) {
  if (totalPages <= 1) {
    return [] as Array<number | "...">;
  }

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1) as Array<
      number | "..."
    >;
  }

  const items: Array<number | "..."> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    items.push("...");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < totalPages - 1) {
    items.push("...");
  }

  items.push(totalPages);
  return items;
}

function normalizeSearchHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === "string" ? normalizeInputText(item) : ""))
    .filter((item) => item.length > 0)
    .slice(0, SEARCH_HISTORY_LIMIT);
}

function normalizeFilters(filters: PersonnelFilters): PersonnelFilters {
  const personalCategory = filters.personalCategory;
  const disableAreaAndTurno = personalCategory === "Gobierno";
  const area = disableAreaAndTurno ? "" : normalizeInputText(filters.area);
  const turno = disableAreaAndTurno ? "" : normalizeInputText(filters.turno);
  const nameOrder =
    filters.nameOrder === "asc" || filters.nameOrder === "desc"
      ? filters.nameOrder
      : "";
  const policialRole =
    personalCategory !== "" && personalCategory !== "Policial"
      ? ""
      : filters.policialRole;
  let dateFilterMode: DateFilterMode | "" =
    filters.dateFilterMode === "thisMonth" ||
    filters.dateFilterMode === "thisWeek" ||
    filters.dateFilterMode === "monthRange" ||
    filters.dateFilterMode === "yearRange" ||
    filters.dateFilterMode === "dateRange" ||
    filters.dateFilterMode === "monthDayRange"
      ? filters.dateFilterMode
      : "";
  let monthFrom =
    dateFilterMode === "monthRange" ? normalizeBirthMonthInput(filters.monthFrom) : "";
  let monthTo =
    dateFilterMode === "monthRange" ? normalizeBirthMonthInput(filters.monthTo) : "";
  let yearFrom =
    dateFilterMode === "yearRange" ? normalizeYearInput(filters.yearFrom) : "";
  let yearTo = dateFilterMode === "yearRange" ? normalizeYearInput(filters.yearTo) : "";
  let dateFrom =
    dateFilterMode === "dateRange" ? normalizeIsoDateInput(filters.dateFrom) : "";
  let dateTo =
    dateFilterMode === "dateRange" ? normalizeIsoDateInput(filters.dateTo) : "";
  let dayMonthFrom =
    dateFilterMode === "monthDayRange"
      ? normalizeDayMonthInput(filters.dayMonthFrom)
      : "";
  let dayMonthTo =
    dateFilterMode === "monthDayRange"
      ? normalizeDayMonthInput(filters.dayMonthTo)
      : "";

  if (dateFilterMode === "monthRange" && (monthFrom === "" || monthTo === "")) {
    dateFilterMode = "";
  }
  if (dateFilterMode === "yearRange" && (yearFrom === "" || yearTo === "")) {
    dateFilterMode = "";
  }
  if (dateFilterMode === "dateRange" && (dateFrom === "" || dateTo === "")) {
    dateFilterMode = "";
  }
  if (
    dateFilterMode === "monthDayRange" &&
    (dayMonthFrom === "" || dayMonthTo === "")
  ) {
    dateFilterMode = "";
  }
  if (dateFilterMode === "") {
    monthFrom = "";
    monthTo = "";
    yearFrom = "";
    yearTo = "";
    dateFrom = "";
    dateTo = "";
    dayMonthFrom = "";
    dayMonthTo = "";
  }

  return {
    personalCategory,
    policialRole,
    area,
    turno,
    nameOrder,
    dateFilterMode,
    monthFrom,
    monthTo,
    yearFrom,
    yearTo,
    dateFrom,
    dateTo,
    dayMonthFrom,
    dayMonthTo,
  };
}

function normalizeStoredFilters(value: unknown): PersonnelFilters {
  if (typeof value !== "object" || value === null) {
    return EMPTY_FILTERS;
  }

  const parsed = value as Record<string, unknown>;
  const personalCategoryRaw =
    typeof parsed.personalCategory === "string" ? parsed.personalCategory : "";
  const personalCategory = PERSONAL_CATEGORIES.includes(
    personalCategoryRaw as PersonalCategory
  )
    ? (personalCategoryRaw as PersonalCategory)
    : "";
  const policialRoleRaw =
    typeof parsed.policialRole === "string" ? parsed.policialRole : "";
  const policialRole = POLICIAL_ROLES.includes(policialRoleRaw as PolicialRole)
    ? (policialRoleRaw as PolicialRole)
    : "";
  const area = typeof parsed.area === "string" ? parsed.area : "";
  const turno = typeof parsed.turno === "string" ? parsed.turno : "";
  const nameOrderRaw = typeof parsed.nameOrder === "string" ? parsed.nameOrder : "";
  const nameOrder =
    nameOrderRaw === "asc" || nameOrderRaw === "desc"
      ? (nameOrderRaw as NameOrder)
      : "";
  const dateFilterModeRaw =
    typeof parsed.dateFilterMode === "string" ? parsed.dateFilterMode : "";
  let dateFilterMode: DateFilterMode | "" =
    dateFilterModeRaw === "thisMonth" ||
    dateFilterModeRaw === "thisWeek" ||
    dateFilterModeRaw === "monthRange" ||
    dateFilterModeRaw === "yearRange" ||
    dateFilterModeRaw === "dateRange" ||
    dateFilterModeRaw === "monthDayRange"
      ? (dateFilterModeRaw as DateFilterMode)
      : "";
  let monthFrom = typeof parsed.monthFrom === "string" ? parsed.monthFrom : "";
  let monthTo = typeof parsed.monthTo === "string" ? parsed.monthTo : "";
  const yearFrom = typeof parsed.yearFrom === "string" ? parsed.yearFrom : "";
  const yearTo = typeof parsed.yearTo === "string" ? parsed.yearTo : "";
  const dateFrom = typeof parsed.dateFrom === "string" ? parsed.dateFrom : "";
  const dateTo = typeof parsed.dateTo === "string" ? parsed.dateTo : "";
  let dayMonthFrom =
    typeof parsed.dayMonthFrom === "string" ? parsed.dayMonthFrom : "";
  let dayMonthTo = typeof parsed.dayMonthTo === "string" ? parsed.dayMonthTo : "";

  const legacyBirthMonth =
    typeof parsed.birthMonth === "string" ? parsed.birthMonth : "";
  const legacyFromDate = typeof parsed.fromDate === "string" ? parsed.fromDate : "";
  const legacyToDate = typeof parsed.toDate === "string" ? parsed.toDate : "";

  if (dateFilterModeRaw === "month") {
    dateFilterMode = "monthRange";
    monthFrom = legacyBirthMonth;
    monthTo = legacyBirthMonth;
  }
  if (dateFilterModeRaw === "range") {
    dateFilterMode = "monthDayRange";
    dayMonthFrom = legacyFromDate;
    dayMonthTo = legacyToDate;
  }

  return normalizeFilters({
    personalCategory,
    policialRole,
    area,
    turno,
    nameOrder,
    dateFilterMode,
    monthFrom,
    monthTo,
    yearFrom,
    yearTo,
    dateFrom,
    dateTo,
    dayMonthFrom,
    dayMonthTo,
  });
}

function normalizeStoredFiltersState(value: unknown): {
  draft: PersonnelFilters;
  applied: PersonnelFilters;
} {
  if (typeof value !== "object" || value === null) {
    return {
      draft: EMPTY_FILTERS,
      applied: EMPTY_FILTERS,
    };
  }

  const parsed = value as Record<string, unknown>;
  const applied = normalizeStoredFilters(parsed.applied);
  const draft = normalizeStoredFilters(parsed.draft);
  return {
    draft,
    applied,
  };
}

function areFiltersEqual(a: PersonnelFilters, b: PersonnelFilters) {
  return (
    a.personalCategory === b.personalCategory &&
    a.policialRole === b.policialRole &&
    a.area === b.area &&
    a.turno === b.turno &&
    a.nameOrder === b.nameOrder &&
    a.dateFilterMode === b.dateFilterMode &&
    a.monthFrom === b.monthFrom &&
    a.monthTo === b.monthTo &&
    a.yearFrom === b.yearFrom &&
    a.yearTo === b.yearTo &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    a.dayMonthFrom === b.dayMonthFrom &&
    a.dayMonthTo === b.dayMonthTo
  );
}

function countActiveFilters(filters: PersonnelFilters) {
  let count = 0;
  if (filters.personalCategory) {
    count += 1;
  }
  if (filters.policialRole) {
    count += 1;
  }
  if (filters.area) {
    count += 1;
  }
  if (filters.turno) {
    count += 1;
  }
  if (filters.nameOrder) {
    count += 1;
  }
  if (filters.dateFilterMode === "thisMonth") {
    count += 1;
  }
  if (filters.dateFilterMode === "thisWeek") {
    count += 1;
  }
  if (filters.dateFilterMode === "monthRange" && filters.monthFrom && filters.monthTo) {
    count += 1;
  }
  if (filters.dateFilterMode === "yearRange" && filters.yearFrom && filters.yearTo) {
    count += 1;
  }
  if (filters.dateFilterMode === "dateRange" && filters.dateFrom && filters.dateTo) {
    count += 1;
  }
  if (
    filters.dateFilterMode === "monthDayRange" &&
    filters.dayMonthFrom &&
    filters.dayMonthTo
  ) {
    count += 1;
  }
  return count;
}

type BuildBirthdaysQueryParamsOptions = {
  filters: PersonnelFilters;
  search: string;
  page?: number;
  limit?: number;
};

function buildBirthdaysQueryParams(options: BuildBirthdaysQueryParamsOptions) {
  const params = new URLSearchParams();
  if (typeof options.page === "number" && options.page > 0) {
    params.set("page", String(options.page));
  }
  if (typeof options.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }

  const normalizedSearch = normalizeInputText(options.search);
  if (normalizedSearch) {
    params.set("q", normalizedSearch);
  }

  const filters = normalizeFilters(options.filters);
  if (filters.personalCategory) {
    params.set("category", filters.personalCategory);
  }
  if (filters.policialRole) {
    params.set("role", filters.policialRole);
  }
  if (filters.area) {
    params.set("area", filters.area);
  }
  if (filters.turno) {
    params.set("turno", filters.turno);
  }
  if (filters.nameOrder) {
    params.set("nameOrder", filters.nameOrder);
  }
  if (filters.dateFilterMode) {
    params.set("dateMode", filters.dateFilterMode);
  }
  if (filters.dateFilterMode === "monthRange") {
    params.set("monthFrom", filters.monthFrom);
    params.set("monthTo", filters.monthTo);
  }
  if (filters.dateFilterMode === "yearRange") {
    params.set("yearFrom", filters.yearFrom);
    params.set("yearTo", filters.yearTo);
  }
  if (filters.dateFilterMode === "dateRange") {
    params.set("dateFrom", filters.dateFrom);
    params.set("dateTo", filters.dateTo);
  }
  if (filters.dateFilterMode === "monthDayRange") {
    const dayMonthFrom = toDayMonthToken(filters.dayMonthFrom);
    const dayMonthTo = toDayMonthToken(filters.dayMonthTo);
    if (dayMonthFrom) {
      params.set("dayMonthFrom", dayMonthFrom);
    }
    if (dayMonthTo) {
      params.set("dayMonthTo", dayMonthTo);
    }
  }

  return params;
}

function escapeCsvValue(value: string) {
  const normalized = value.replace(/\r?\n/g, " ").trim();
  if (normalized.includes('"') || normalized.includes(";")) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function getPolicialCategoryForCsv(personal: PersonalInfo) {
  if (personal.category !== "Policial") {
    return "";
  }
  if (personal.policial === "Oficial") {
    return personal.oficialCategory ?? "";
  }
  if (
    (personal.policial === "Suboficial" || personal.policial === "Tecnico") &&
    personal.suboficialCategory
  ) {
    return formatSuboficialCategoryLabel(personal.suboficialCategory, personal.policial);
  }
  return "";
}

function buildFilteredRecordsCsv(records: BirthdayRecord[]) {
  const rows = [
    [
      "Apellido",
      "Nombre",
      "Fecha de nacimiento",
      "Area",
      "Turno",
      "Categoria",
      "Tipo policial",
      "Categoria policial",
    ],
    ...records.map((record) => [
      record.lastName,
      record.firstName,
      formatBirthDate(record.birthDate),
      record.area ?? "",
      record.turno ?? "",
      record.personal.category,
      record.personal.category === "Policial"
        ? formatPolicialRoleLabel(record.personal.policial)
        : "",
      getPolicialCategoryForCsv(record.personal),
    ]),
  ];

  return rows
    .map((row) => row.map((value) => escapeCsvValue(value)).join(";"))
    .join("\r\n");
}

function getFilteredRecordsDownloadFileName(now = new Date()) {
  return `personal-cargado-filtrado-${now.toISOString().slice(0, 10)}.csv`;
}

export default function PersonalCargadoPage() {
  const [records, setRecords] = useState<BirthdayRecord[]>([]);
  const [isLoadingSessionView, setIsLoadingSessionView] = useState(true);
  const [canAccessAnnualDashboard, setCanAccessAnnualDashboard] = useState(true);
  const [canManageRecords, setCanManageRecords] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [canExitClientMode, setCanExitClientMode] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isDownloadingFiltered, setIsDownloadingFiltered] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [isDownloadPreviewOpen, setIsDownloadPreviewOpen] = useState(false);
  const [isPreparingDownloadPreview, setIsPreparingDownloadPreview] = useState(false);
  const [downloadPreviewInfo, setDownloadPreviewInfo] =
    useState<DownloadPreviewInfo | null>(null);
  const [downloadPreviewError, setDownloadPreviewError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedFilters, setAppliedFilters] =
    useState<PersonnelFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PersonnelFilters>(EMPTY_FILTERS);
  const [hasRestoredFilters, setHasRestoredFilters] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [isSearchHistoryOpen, setIsSearchHistoryOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isNoticeVisible, setIsNoticeVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<BirthdayRecord | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditNoticeVisible, setIsEditNoticeVisible] = useState(false);
  const [confirmationState, setConfirmationState] =
    useState<ConfirmationState | null>(null);
  const confirmationResolverRef = useRef<((value: boolean) => void) | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editTurno, setEditTurno] = useState("");
  const [editPersonalCategory, setEditPersonalCategory] =
    useState<PersonalCategory>("Policial");
  const [editPolicialRole, setEditPolicialRole] =
    useState<SelectedPolicialRole>("");
  const [editOficialCategory, setEditOficialCategory] =
    useState<OficialCategory>(OFICIAL_CATEGORIES[0]);
  const [editSuboficialCategory, setEditSuboficialCategory] =
    useState<SuboficialCategory>(SUBOFICIAL_CATEGORIES[0]);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const filterBoxRef = useRef<HTMLDivElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isFilterMenuOpeningUp, setIsFilterMenuOpeningUp] = useState(false);
  const [filterMenuMaxHeight, setFilterMenuMaxHeight] = useState(360);
  const noticeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editNoticeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editNoticeCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const downloadProgressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const downloadPreviewRequestIdRef = useRef(0);
  const activeNotice = error
    ? { tone: "error" as const, text: error }
    : message
      ? { tone: "success" as const, text: message }
      : null;

  const updateFilterMenuLayout = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const button = filterButtonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow =
      viewportHeight -
      rect.bottom -
      FILTER_MENU_OFFSET_PX -
      FILTER_MENU_VIEWPORT_MARGIN_PX;
    const spaceAbove =
      rect.top - FILTER_MENU_OFFSET_PX - FILTER_MENU_VIEWPORT_MARGIN_PX;
    const openUpwards =
      spaceBelow < FILTER_MENU_MIN_HEIGHT_BELOW_PX && spaceAbove > spaceBelow;
    const availableSpace = openUpwards ? spaceAbove : spaceBelow;
    const fallbackMaxHeight = viewportHeight - FILTER_MENU_VIEWPORT_MARGIN_PX * 2;
    const resolvedMaxHeight =
      availableSpace > 0 ? availableSpace : Math.max(1, fallbackMaxHeight);

    setIsFilterMenuOpeningUp(openUpwards);
    setFilterMenuMaxHeight(Math.floor(resolvedMaxHeight));
  }, []);

  const showDownloadToast = useCallback((message: string) => {
    setDownloadToast(message);
    if (downloadToastTimerRef.current) {
      clearTimeout(downloadToastTimerRef.current);
    }
    downloadToastTimerRef.current = setTimeout(() => {
      setDownloadToast(null);
      downloadToastTimerRef.current = null;
    }, 3000);
  }, []);

  function closeDownloadPreviewModal() {
    if (isDownloadingFiltered) {
      return;
    }

    downloadPreviewRequestIdRef.current += 1;
    setIsDownloadPreviewOpen(false);
    setIsPreparingDownloadPreview(false);
    setDownloadPreviewInfo(null);
    setDownloadPreviewError(null);
  }

  async function openDownloadPreviewModal() {
    if (activeFilterCount === 0 || isDownloadingFiltered || isLoadingRecords) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsDownloadPreviewOpen(true);
    setIsPreparingDownloadPreview(true);
    setDownloadPreviewInfo(null);
    setDownloadPreviewError(null);

    const requestId = downloadPreviewRequestIdRef.current + 1;
    downloadPreviewRequestIdRef.current = requestId;

    try {
      const params = buildAppliedQueryParams({ page: 1, limit: 1 });
      const [response] = await Promise.all([
        fetch(`/api/birthdays?${params.toString()}`, {
          cache: "no-store",
        }),
        new Promise((resolve) => setTimeout(resolve, 420)),
      ]);

      const body = (await response.json()) as ApiListResponse | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo preparar la descarga del listado filtrado."
        );
      }

      const pagination = normalizePagination(body.pagination);
      const fallbackCount = Array.isArray(body.data) ? body.data.length : 0;
      const totalMatches =
        pagination && pagination.total >= 0 ? pagination.total : fallbackCount;

      if (downloadPreviewRequestIdRef.current !== requestId) {
        return;
      }

      setDownloadPreviewInfo({
        totalMatches,
        fileName: getFilteredRecordsDownloadFileName(),
      });
    } catch (caught) {
      if (downloadPreviewRequestIdRef.current !== requestId) {
        return;
      }

      const detail =
        caught instanceof Error
          ? caught.message
          : "No se pudo preparar la descarga del listado filtrado.";
      setDownloadPreviewError(detail);
    } finally {
      if (downloadPreviewRequestIdRef.current === requestId) {
        setIsPreparingDownloadPreview(false);
      }
    }
  }

  function saveSearchHistory(nextHistory: string[]) {
    setSearchHistory(nextHistory);
    try {
      window.localStorage.setItem(
        SEARCH_HISTORY_KEY,
        JSON.stringify(nextHistory.slice(0, SEARCH_HISTORY_LIMIT))
      );
    } catch {
      // Ignored: localStorage may be unavailable in private contexts.
    }
  }

  function pushSearchHistory(term: string) {
    const normalizedTerm = normalizeInputText(term);
    if (!normalizedTerm) {
      return;
    }

    const nextHistory = [
      normalizedTerm,
      ...searchHistory.filter((item) => item !== normalizedTerm),
    ].slice(0, SEARCH_HISTORY_LIMIT);
    saveSearchHistory(nextHistory);
  }

  function removeSearchHistory(term: string) {
    const normalizedTerm = normalizeInputText(term);
    if (!normalizedTerm) {
      return;
    }

    const nextHistory = searchHistory.filter((item) => item !== normalizedTerm);
    saveSearchHistory(nextHistory);
  }

  function openFilterMenu() {
    updateFilterMenuLayout();
    setIsFilterMenuOpen(true);
    setIsSearchHistoryOpen(false);
  }

  function applyDraftFilters() {
    if (
      draftFilters.dateFilterMode === "yearRange" &&
      draftFilters.yearFrom.length > 0 &&
      draftFilters.yearTo.length > 0 &&
      Number(draftFilters.yearFrom) > Number(draftFilters.yearTo)
    ) {
      setError("El año desde no puede ser mayor que el año hasta.");
      setMessage(null);
      return;
    }
    if (
      draftFilters.dateFilterMode === "dateRange" &&
      draftFilters.dateFrom.length > 0 &&
      draftFilters.dateTo.length > 0 &&
      draftFilters.dateFrom > draftFilters.dateTo
    ) {
      setError("La fecha desde no puede ser mayor que la fecha hasta.");
      setMessage(null);
      return;
    }
    if (draftFilters.dateFilterMode === "monthDayRange") {
      const dayMonthFrom = toDayMonthToken(draftFilters.dayMonthFrom);
      const dayMonthTo = toDayMonthToken(draftFilters.dayMonthTo);
      if (!dayMonthFrom || !dayMonthTo) {
        setError("Completá el rango día/mes con una fecha desde y una fecha hasta.");
        setMessage(null);
        return;
      }
    }

    const normalized = normalizeFilters(draftFilters);
    setDraftFilters(normalized);
    setAppliedFilters(normalized);
    setCurrentPage(1);
    setIsFilterMenuOpen(false);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setCurrentPage(1);
    setIsFilterMenuOpen(false);
  }

  const buildAppliedQueryParams = useCallback(
    (options?: { paginated?: boolean; page?: number; limit?: number }) =>
      buildBirthdaysQueryParams({
        filters: appliedFilters,
        search: searchQuery,
        page:
          options?.paginated === false ? undefined : (options?.page ?? currentPage),
        limit:
          options?.paginated === false ? undefined : (options?.limit ?? RECORDS_PER_PAGE),
      }),
    [appliedFilters, searchQuery, currentPage]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadSessionView() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const body = (await response.json()) as SessionViewResponse | ApiErrorResponse;
        if (!response.ok || isApiError(body)) {
          throw new Error(
            isApiError(body) ? body.error : "No se pudo validar permisos de sesion."
          );
        }

        if (!isMounted) {
          return;
        }

        const canManage = body.permissions?.canManagePersonalCargado === true;
        const canAccessAnnual = body.permissions?.canAccessAnnualDashboard === true;
        const canExitMode = body.canExitClientMode === true;
        const email = asNonEmptyString(body.user?.email);
        const role = asNonEmptyString(body.user?.role);
        setCanManageRecords(canManage);
        setCanAccessAnnualDashboard(canAccessAnnual);
        setCanExitClientMode(canExitMode);
        setSessionEmail(email);
        setSessionRole(role);
      } catch {
        if (!isMounted) {
          return;
        }

        setCanManageRecords(false);
        setCanAccessAnnualDashboard(false);
        setCanExitClientMode(false);
        setSessionEmail(null);
        setSessionRole(null);
      } finally {
        if (isMounted) {
          setIsLoadingSessionView(false);
        }
      }
    }

    void loadSessionView();

    return () => {
      isMounted = false;
    };
  }, []);

  async function downloadFilteredRecords(options?: { closePreviewOnSuccess?: boolean }) {
    if (activeFilterCount === 0 || isDownloadingFiltered) {
      return;
    }

    if (downloadProgressTimerRef.current) {
      clearInterval(downloadProgressTimerRef.current);
      downloadProgressTimerRef.current = null;
    }
    if (downloadProgressResetTimerRef.current) {
      clearTimeout(downloadProgressResetTimerRef.current);
      downloadProgressResetTimerRef.current = null;
    }

    setDownloadProgress(12);
    downloadProgressTimerRef.current = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 88) {
          return prev;
        }
        return Math.min(88, prev + Math.max(2, Math.round((88 - prev) * 0.2)));
      });
    }, 120);
    setIsDownloadingFiltered(true);
    let completed = false;
    setDownloadPreviewError(null);

    try {
      const params = buildAppliedQueryParams({ paginated: false });
      const response = await fetch(`/api/birthdays?${params.toString()}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as ApiListResponse | ApiErrorResponse;

      if (!response.ok || isApiError(body) || !Array.isArray(body.data)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo descargar el listado filtrado."
        );
      }

      const normalized = body.data
        .map((item) => normalizeBirthdayRecord(item))
        .filter((item): item is BirthdayRecord => item !== null);

      if (normalized.length === 0) {
        const detail = "No hay registros para descargar con los filtros actuales.";
        setDownloadPreviewInfo({
          totalMatches: 0,
          fileName: getFilteredRecordsDownloadFileName(),
        });
        setDownloadPreviewError(detail);
        setError(detail);
        setMessage(null);
        return;
      }

      const csv = buildFilteredRecordsCsv(normalized);
      const csvBlob = new Blob([`\uFEFF${csv}`], {
        type: "text/csv;charset=utf-8;",
      });
      const downloadUrl = URL.createObjectURL(csvBlob);
      const link = document.createElement("a");
      const dateLabel = new Date().toISOString().slice(0, 10);
      link.href = downloadUrl;
      link.download = `personal-cargado-filtrado-${dateLabel}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      completed = true;
      setError(null);
      setMessage(null);
      setDownloadPreviewInfo({
        totalMatches: normalized.length,
        fileName: getFilteredRecordsDownloadFileName(),
      });
      showDownloadToast(
        `Se descargaron ${normalized.length} ${
          normalized.length === 1 ? "registro" : "registros"
        } filtrados.`
      );
      if (options?.closePreviewOnSuccess) {
        setIsDownloadPreviewOpen(false);
      }
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al descargar el listado filtrado.";
      setDownloadPreviewError(detail);
      setError(detail);
      setMessage(null);
    } finally {
      if (downloadProgressTimerRef.current) {
        clearInterval(downloadProgressTimerRef.current);
        downloadProgressTimerRef.current = null;
      }
      if (downloadProgressResetTimerRef.current) {
        clearTimeout(downloadProgressResetTimerRef.current);
      }
      if (completed) {
        setDownloadProgress(100);
        downloadProgressResetTimerRef.current = setTimeout(() => {
          setDownloadProgress(0);
          downloadProgressResetTimerRef.current = null;
        }, 380);
      } else {
        setDownloadProgress(0);
        downloadProgressResetTimerRef.current = null;
      }
      setIsDownloadingFiltered(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const normalized = normalizeInputText(searchInput);
      setSearchQuery(normalized);
      setCurrentPage(1);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      setSearchHistory(normalizeSearchHistory(parsed));
    } catch {
      setSearchHistory([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      const restored = normalizeStoredFiltersState(parsed);
      setDraftFilters(restored.draft);
      setAppliedFilters(restored.applied);
    } catch {
      setDraftFilters(EMPTY_FILTERS);
      setAppliedFilters(EMPTY_FILTERS);
    } finally {
      setHasRestoredFilters(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredFilters) {
      return;
    }

    try {
      window.localStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          draft: normalizeFilters(draftFilters),
          applied: normalizeFilters(appliedFilters),
        })
      );
    } catch {
      // Ignored: localStorage may be unavailable in private contexts.
    }
  }, [draftFilters, appliedFilters, hasRestoredFilters]);

  useEffect(() => {
    if (!isSearchHistoryOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!searchBoxRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !searchBoxRef.current.contains(target)) {
        setIsSearchHistoryOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSearchHistoryOpen]);

  useEffect(() => {
    if (!isFilterMenuOpen) {
      return;
    }

    updateFilterMenuLayout();

    function handleClickOutside(event: MouseEvent) {
      if (!filterBoxRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !filterBoxRef.current.contains(target)) {
        setIsFilterMenuOpen(false);
      }
    }

    function handleViewportUpdate() {
      updateFilterMenuLayout();
    }

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleViewportUpdate);
    window.addEventListener("scroll", handleViewportUpdate, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleViewportUpdate);
      window.removeEventListener("scroll", handleViewportUpdate, true);
    };
  }, [isFilterMenuOpen, updateFilterMenuLayout]);

  useEffect(() => {
    if (!hasRestoredFilters) {
      return;
    }

    let isMounted = true;

    async function loadRecords() {
      setIsLoadingRecords(true);

      try {
        const params = buildAppliedQueryParams();

        const response = await fetch(`/api/birthdays?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as ApiListResponse | ApiErrorResponse;

        if (!response.ok || isApiError(body) || !Array.isArray(body.data)) {
          throw new Error(
            isApiError(body)
              ? body.error
              : "No se pudieron cargar los cumpleaños guardados."
          );
        }

        const normalized = body.data
          .map((item) => normalizeBirthdayRecord(item))
          .filter((item): item is BirthdayRecord => item !== null);
        const pagination = normalizePagination(body.pagination);

        if (!isMounted) {
          return;
        }

        const nextTotalPages =
          pagination && pagination.totalPages >= 0 ? pagination.totalPages : 0;
        const nextTotalRecords =
          pagination && pagination.total >= 0 ? pagination.total : normalized.length;

        if (nextTotalPages === 0 && currentPage !== 1) {
          setCurrentPage(1);
          return;
        }

        if (nextTotalPages > 0 && currentPage > nextTotalPages) {
          setCurrentPage(nextTotalPages);
          return;
        }

        setRecords(normalized);
        setTotalPages(nextTotalPages);
        setTotalRecords(nextTotalRecords);
      } catch (caught) {
        if (!isMounted) {
          return;
        }

        const detail =
          caught instanceof Error
            ? caught.message
            : "Error al cargar cumpleaños desde la base de datos.";
        setError(detail);
        setMessage(null);
      } finally {
        if (isMounted) {
          setIsLoadingRecords(false);
        }
      }
    }

    void loadRecords();

    return () => {
      isMounted = false;
    };
  }, [buildAppliedQueryParams, reloadKey, hasRestoredFilters, currentPage]);

  useEffect(() => {
    return () => {
      if (downloadToastTimerRef.current) {
        clearTimeout(downloadToastTimerRef.current);
        downloadToastTimerRef.current = null;
      }
      if (downloadProgressTimerRef.current) {
        clearInterval(downloadProgressTimerRef.current);
        downloadProgressTimerRef.current = null;
      }
      if (downloadProgressResetTimerRef.current) {
        clearTimeout(downloadProgressResetTimerRef.current);
        downloadProgressResetTimerRef.current = null;
      }
      if (confirmationResolverRef.current) {
        confirmationResolverRef.current(false);
        confirmationResolverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (canManageRecords) {
      return;
    }

    setEditingRecord(null);
    setConfirmationState(null);
  }, [canManageRecords]);

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
    if (!editError) {
      setIsEditNoticeVisible(false);
      if (editNoticeHideTimerRef.current) {
        clearTimeout(editNoticeHideTimerRef.current);
        editNoticeHideTimerRef.current = null;
      }
      if (editNoticeCleanupTimerRef.current) {
        clearTimeout(editNoticeCleanupTimerRef.current);
        editNoticeCleanupTimerRef.current = null;
      }
      return;
    }

    setIsEditNoticeVisible(true);

    if (editNoticeHideTimerRef.current) {
      clearTimeout(editNoticeHideTimerRef.current);
    }
    if (editNoticeCleanupTimerRef.current) {
      clearTimeout(editNoticeCleanupTimerRef.current);
    }

    editNoticeHideTimerRef.current = setTimeout(() => {
      setIsEditNoticeVisible(false);
      editNoticeCleanupTimerRef.current = setTimeout(() => {
        setEditError(null);
      }, NOTICE_ANIMATION_MS);
    }, NOTICE_AUTO_DISMISS_MS);

    return () => {
      if (editNoticeHideTimerRef.current) {
        clearTimeout(editNoticeHideTimerRef.current);
        editNoticeHideTimerRef.current = null;
      }
      if (editNoticeCleanupTimerRef.current) {
        clearTimeout(editNoticeCleanupTimerRef.current);
        editNoticeCleanupTimerRef.current = null;
      }
    };
  }, [editError]);

  const paginationItems = useMemo(
    () => buildPaginationItems(totalPages, currentPage),
    [totalPages, currentPage]
  );
  const normalizedDraftFilters = useMemo(
    () => normalizeFilters(draftFilters),
    [draftFilters]
  );
  const activeFilterCount = useMemo(
    () => countActiveFilters(appliedFilters),
    [appliedFilters]
  );
  const hasPendingFilterChanges = useMemo(
    () => !areFiltersEqual(normalizedDraftFilters, appliedFilters),
    [normalizedDraftFilters, appliedFilters]
  );
  const isRoleFilterDisabled =
    draftFilters.personalCategory !== "" &&
    draftFilters.personalCategory !== "Policial";
  const isAreaTurnoFilterDisabled = draftFilters.personalCategory === "Gobierno";
  const hasInvalidYearRange =
    draftFilters.dateFilterMode === "yearRange" &&
    draftFilters.yearFrom.length > 0 &&
    draftFilters.yearTo.length > 0 &&
    Number(draftFilters.yearFrom) > Number(draftFilters.yearTo);
  const hasInvalidDateRange =
    draftFilters.dateFilterMode === "dateRange" &&
    draftFilters.dateFrom.length > 0 &&
    draftFilters.dateTo.length > 0 &&
    draftFilters.dateFrom > draftFilters.dateTo;
  const hasIncompleteMonthDayRange =
    draftFilters.dateFilterMode === "monthDayRange" &&
    (!toDayMonthToken(draftFilters.dayMonthFrom) ||
      !toDayMonthToken(draftFilters.dayMonthTo));
  const selectedMonthDayRangeLabel = useMemo(() => {
    if (draftFilters.dateFilterMode !== "monthDayRange") {
      return "";
    }

    const fromLabel = formatDayMonthTokenForDisplay(draftFilters.dayMonthFrom);
    const toLabel = formatDayMonthTokenForDisplay(draftFilters.dayMonthTo);
    if (!fromLabel || !toLabel) {
      return "";
    }

    return `${fromLabel} a ${toLabel}`;
  }, [
    draftFilters.dateFilterMode,
    draftFilters.dayMonthFrom,
    draftFilters.dayMonthTo,
  ]);
  const monthDayRangeCrossesYear = useMemo(
    () =>
      draftFilters.dateFilterMode === "monthDayRange" &&
      isCrossYearDayMonthRange(draftFilters.dayMonthFrom, draftFilters.dayMonthTo),
    [
      draftFilters.dateFilterMode,
      draftFilters.dayMonthFrom,
      draftFilters.dayMonthTo,
    ]
  );
  const fromMonthDayParts = useMemo(
    () => splitDayMonthToken(draftFilters.dayMonthFrom),
    [draftFilters.dayMonthFrom]
  );
  const toMonthDayParts = useMemo(
    () => splitDayMonthToken(draftFilters.dayMonthTo),
    [draftFilters.dayMonthTo]
  );
  const fromDayOptions = useMemo(
    () => buildDayOptions(fromMonthDayParts.month),
    [fromMonthDayParts.month]
  );
  const toDayOptions = useMemo(
    () => buildDayOptions(toMonthDayParts.month),
    [toMonthDayParts.month]
  );

  const requiresAreaAndTurno = true;
  const hasCustomArea =
    editArea.length > 0 &&
    !AREA_CATEGORIES.includes(editArea as (typeof AREA_CATEGORIES)[number]);
  const hasCustomTurno =
    editTurno.length > 0 &&
    !TURNO_CATEGORIES.includes(editTurno as (typeof TURNO_CATEGORIES)[number]);
  const isConfirmProcessing = isUpdating || deletingId !== null;

  function openEditModal(record: BirthdayRecord) {
    if (!canManageRecords) {
      return;
    }

    setEditingRecord(record);
    setEditFirstName(record.firstName);
    setEditLastName(record.lastName);
    setEditBirthDate(record.birthDate);
    setEditArea(record.area ?? "");
    setEditTurno(record.turno ?? "");
    setEditPersonalCategory(record.personal.category);

    if (record.personal.category === "Policial") {
      setEditPolicialRole(record.personal.policial);
      setEditOficialCategory(asOficialCategory(record.personal.oficialCategory));
      setEditSuboficialCategory(
        asSuboficialCategory(record.personal.suboficialCategory)
      );
    } else {
      setEditPolicialRole("");
      setEditOficialCategory(OFICIAL_CATEGORIES[0]);
      setEditSuboficialCategory(SUBOFICIAL_CATEGORIES[0]);
    }

    setEditError(null);
  }

  function closeEditModal() {
    if (isUpdating) {
      return;
    }

    setEditingRecord(null);
    setEditError(null);
  }

  function requestConfirmation(
    config: ConfirmationState
  ): Promise<boolean> {
    setConfirmationState(config);

    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }

  function resolveConfirmation(value: boolean) {
    if (confirmationResolverRef.current) {
      confirmationResolverRef.current(value);
      confirmationResolverRef.current = null;
    }

    setConfirmationState(null);
  }

  async function removeRecord(id: string) {
    if (!canManageRecords) {
      return;
    }

    const selected = records.find((item) => item.id === id);
    const fullName = selected
      ? `${selected.lastName}, ${selected.firstName}`
      : "el cumpleaños seleccionado";
    const confirmed = await requestConfirmation({
      title: "Confirmar eliminación",
      description: `Se eliminará el registro de ${fullName}. Esta acción no se puede deshacer.`,
      confirmLabel: "Sí, eliminar",
      tone: "danger",
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/birthdays?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
      const body = (await response.json()) as
        | { ok?: unknown }
        | ApiErrorResponse;

      if (!response.ok || isApiError(body) || body.ok !== true) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo eliminar el cumpleaños seleccionado."
        );
      }

      const shouldGoToPreviousPage = records.length === 1 && currentPage > 1;
      if (shouldGoToPreviousPage) {
        setCurrentPage((prev) => Math.max(prev - 1, 1));
      } else {
        setReloadKey((prev) => prev + 1);
      }
      dispatchBirthdaysUpdated();
      setMessage("Cumpleaños eliminado correctamente.");
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al eliminar cumpleaños de la base de datos.";
      setError(detail);
      setMessage(null);
    } finally {
      setDeletingId((prev) => (prev === id ? null : prev));
    }
  }

  async function handleUpdateRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageRecords) {
      return;
    }

    if (!editingRecord) {
      return;
    }

    const cleanName = normalizePersonName(editFirstName);
    const cleanLastName = normalizePersonName(editLastName);
    const selectedArea = normalizeInputText(editArea);
    const selectedTurno = normalizeInputText(editTurno);

    if (
      !cleanName ||
      !cleanLastName ||
      !editBirthDate ||
      (!selectedArea || !selectedTurno)
    ) {
      setEditError(
        requiresAreaAndTurno
          ? "Completá nombre, apellido, área, turno y fecha de nacimiento."
          : "Completá nombre, apellido y fecha de nacimiento."
      );
      return;
    }

    if (editPersonalCategory === "Policial" && !editPolicialRole) {
      setEditError("Seleccioná un tipo de personal policial.");
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    if (editBirthDate > todayIso) {
      setEditError("La fecha de nacimiento no puede ser futura.");
      return;
    }

    const personal: PersonalInfo =
      editPersonalCategory === "Policial"
        ? {
            category: "Policial",
            policial: editPolicialRole as PolicialRole,
            oficialCategory:
              editPolicialRole === "Oficial" ? editOficialCategory : undefined,
            suboficialCategory:
              editPolicialRole === "Suboficial" || editPolicialRole === "Tecnico"
                ? editSuboficialCategory
                : undefined,
          }
        : editPersonalCategory === "Gobierno"
          ? { category: "Gobierno" }
          : { category: "Civil" };

    const fullName = `${cleanLastName}, ${cleanName}`;
    const confirmed = await requestConfirmation({
      title: "Confirmar actualización",
      description: `Se guardarán los cambios del registro de ${fullName}.`,
      confirmLabel: "Sí, guardar cambios",
      tone: "primary",
    });

    if (!confirmed) {
      return;
    }

    setIsUpdating(true);
    setEditError(null);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/birthdays?id=${encodeURIComponent(editingRecord.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: cleanName,
            lastName: cleanLastName,
            birthDate: editBirthDate,
            area: requiresAreaAndTurno ? selectedArea : undefined,
            turno: requiresAreaAndTurno ? selectedTurno : undefined,
            personal,
          }),
        }
      );
      const body = (await response.json()) as ApiDataResponse | ApiErrorResponse;

      if (!response.ok || isApiError(body)) {
        throw new Error(
          isApiError(body)
            ? body.error
            : "No se pudo actualizar el cumpleaños seleccionado."
        );
      }

      const updatedRecord = normalizeBirthdayRecord(body.data);

      if (!updatedRecord) {
        throw new Error("El servidor no devolvió un cumpleaños válido.");
      }

      setReloadKey((prev) => prev + 1);
      dispatchBirthdaysUpdated();
      setMessage("Cumpleaños actualizado correctamente.");
      setEditingRecord(null);
    } catch (caught) {
      const detail =
        caught instanceof Error
          ? caught.message
          : "Error al actualizar cumpleaños en la base de datos.";
      setEditError(detail);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-10 sm:px-6 lg:h-screen lg:overflow-hidden lg:py-4">
      {downloadToast ? (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[220] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2">
          <p
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-100 shadow-lg backdrop-blur"
          >
            {downloadToast}
          </p>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-4xl space-y-5 lg:flex lg:h-full lg:flex-col lg:space-y-4">
        <header className="relative z-30 overflow-visible rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-6 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 -bottom-28 h-56 w-56 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <div className="relative z-20 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <SectionBreadcrumb
                items={[
                  canAccessAnnualDashboard
                    ? { label: "Dashboard", href: "/dashboard" }
                    : { label: "Calendario anual", href: "/anual" },
                  { label: "Personal cargado" },
                ]}
                className="text-slate-300/70 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-300/70"
              />
              <h1 className="text-3xl font-bold text-slate-100 sm:text-4xl">
                Personal cargado
              </h1>
              <p className="mt-1 text-sm text-slate-300/90">
                Listado completo de cumpleaños guardados.
              </p>
            </div>
            <div className="relative order-first z-[120] flex flex-wrap items-center gap-2 self-end sm:order-none sm:self-auto">
              {canManageRecords ? (
                <div className="hidden sm:block">
                  <CreateBirthdayEventButton
                    buttonClassName="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-sky-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                    onCreated={() => {
                      setCurrentPage(1);
                      setReloadKey((prev) => prev + 1);
                    }}
                  />
                </div>
              ) : null}
              {sessionRole === "ADMIN" ? (
                <UserNavbar
                  dashboardHref="/anual/personal-cargado"
                  hideDashboardLink
                  className="z-[140]"
                  email={sessionEmail}
                  role={sessionRole}
                />
              ) : !isLoadingSessionView &&
                sessionRole === "CLIENTE" &&
                canExitClientMode ? (
                <ExitClientModeButton className="inline-flex h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 text-sm font-semibold text-slate-100 shadow-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60" />
              ) : null}
            </div>
          </div>

          {canManageRecords ? (
            <div className="relative z-0 mt-4 sm:hidden">
              <CreateBirthdayEventButton
                buttonClassName="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-sky-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                onCreated={() => {
                  setCurrentPage(1);
                  setReloadKey((prev) => prev + 1);
                }}
              />
            </div>
          ) : null}
        </header>

        {!isLoadingSessionView && !canManageRecords ? (
          <p className="rounded-xl border border-sky-300/30 bg-sky-400/15 px-4 py-3 text-sm text-sky-100">
            Modo solo lectura activo para el rol CLIENTE.
          </p>
        ) : null}

        {activeNotice ? (
          <p
            className={`rounded-xl px-4 py-3 text-sm transition-all duration-300 ease-out ${
              activeNotice.tone === "success"
                ? "border border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                : "border border-red-300/30 bg-red-400/15 text-red-100"
            } ${
              isNoticeVisible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
            }`}
          >
            {activeNotice.text}
          </p>
        ) : null}

        <section className="relative z-10 overflow-visible rounded-2xl border border-white/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-4 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <div className="relative z-40 mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="w-full sm:max-w-md">
              <span className="sr-only">Buscar personal cargado</span>
              <div className="relative" ref={searchBoxRef}>
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-300/70">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <circle cx="9" cy="9" r="5.5" />
                    <path d="M13.2 13.2 17 17" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onFocus={() => {
                    setIsSearchHistoryOpen(true);
                  }}
                  onBlur={() => {
                    const normalized = normalizeInputText(searchInput);
                    pushSearchHistory(normalized);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsSearchHistoryOpen(false);
                      return;
                    }

                    if (event.key === "Enter") {
                      const normalized = normalizeInputText(searchInput);
                      setSearchInput(normalized);
                      setSearchQuery(normalized);
                      setCurrentPage(1);
                      pushSearchHistory(normalized);
                      setIsSearchHistoryOpen(false);
                    }
                  }}
                  placeholder="Buscar por nombre, apellido, área o turno"
                  className="w-full rounded-xl border border-white/20 bg-slate-900/80 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                />

                {isSearchHistoryOpen && searchHistory.length > 0 ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[80] rounded-xl border border-white/20 bg-slate-950/90 p-1.5 shadow-lg shadow-black/45 backdrop-blur-md sm:z-50">
                    {searchHistory.map((item) => (
                      <div
                        key={`search-history-${item}`}
                        className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-white/10"
                      >
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            setSearchInput(item);
                            setSearchQuery(item);
                            setCurrentPage(1);
                            pushSearchHistory(item);
                            setIsSearchHistoryOpen(false);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-sm text-slate-200"
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center text-slate-300/70">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <circle cx="10" cy="10" r="6.5" />
                              <path d="M10 6.5v3.8l2.4 1.4" />
                            </svg>
                          </span>
                          <span className="truncate">{item}</span>
                        </button>

                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            removeSearchHistory(item);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300/70 transition hover:bg-white/10 hover:text-slate-100"
                          aria-label={`Quitar ${item} del historial`}
                          title="Quitar del historial"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </label>

            <div className="relative z-50 flex items-center gap-2 sm:ml-auto" ref={filterBoxRef}>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    void openDownloadPreviewModal();
                  }}
                  disabled={
                    isDownloadingFiltered || isLoadingRecords || isPreparingDownloadPreview
                  }
                  aria-label="Descargar listado filtrado"
                  title="Descargar listado filtrado"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-300/35 bg-sky-300/15 text-sky-100 transition hover:bg-sky-300/20 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M10 3.5v8.2" />
                    <path d="m6.9 8.9 3.1 3.1 3.1-3.1" />
                    <path d="M4 14.5h12" />
                  </svg>
                </button>
              ) : null}

              <button
                ref={filterButtonRef}
                type="button"
                onClick={() => {
                  if (isFilterMenuOpen) {
                    setIsFilterMenuOpen(false);
                    return;
                  }
                  openFilterMenu();
                }}
                aria-expanded={isFilterMenuOpen}
                aria-haspopup="dialog"
                aria-label="Filtros"
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                  activeFilterCount > 0
                    ? "border-sky-300/35 bg-sky-300/15 text-sky-100 hover:bg-sky-300/20"
                    : "border-white/20 bg-white/10 text-slate-100 hover:bg-white/15"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M3 5.5h4.5" />
                  <circle cx="9.2" cy="5.5" r="1.6" />
                  <path d="M10.8 5.5H17" />
                  <path d="M3 10h8" />
                  <circle cx="13.2" cy="10" r="1.6" />
                  <path d="M14.8 10H17" />
                  <path d="M3 14.5h2.5" />
                  <circle cx="7.8" cy="14.5" r="1.6" />
                  <path d="M9.4 14.5H17" />
                </svg>
                {activeFilterCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-300 px-1 text-xs text-slate-950">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>

              {isFilterMenuOpen ? (
                <div
                  role="dialog"
                  aria-label="Filtros de búsqueda"
                  className={`absolute right-0 z-[60] w-[min(calc(100vw-2rem),22rem)] overflow-y-auto overscroll-contain rounded-xl border border-white/20 bg-slate-950/90 p-3 shadow-lg shadow-black/45 backdrop-blur-md ${
                    isFilterMenuOpeningUp
                      ? "bottom-[calc(100%+0.35rem)]"
                      : "top-[calc(100%+0.35rem)]"
                  }`}
                  style={{ maxHeight: `${filterMenuMaxHeight}px` }}
                >
                  <div className="space-y-3">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                        Categoría
                        <div className="relative mt-1">
                          <select
                            value={draftFilters.personalCategory}
                            onChange={(event) => {
                              const nextCategory = event.target.value as
                                | PersonalCategory
                                | "";
                              setDraftFilters((prev) => ({
                                ...prev,
                                personalCategory: nextCategory,
                                policialRole:
                                  nextCategory !== "" && nextCategory !== "Policial"
                                    ? ""
                                    : prev.policialRole,
                                area: nextCategory === "Gobierno" ? "" : prev.area,
                                turno: nextCategory === "Gobierno" ? "" : prev.turno,
                              }));
                            }}
                            className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                          >
                            <option value="">Todas</option>
                            {PERSONAL_CATEGORIES.map((category) => (
                              <option key={`filter-category-${category}`} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                          <SelectChevron />
                        </div>
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                        Tipo policial
                        <div className="relative mt-1">
                          <select
                            value={draftFilters.policialRole}
                            onChange={(event) =>
                              setDraftFilters((prev) => ({
                                ...prev,
                                policialRole: event.target.value as PolicialRole | "",
                              }))
                            }
                            disabled={isRoleFilterDisabled}
                            className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                          >
                            <option value="">Todos</option>
                            {POLICIAL_ROLES.map((role) => (
                              <option key={`filter-role-${role}`} value={role}>
                                {formatPolicialRoleLabel(role)}
                              </option>
                            ))}
                          </select>
                          <SelectChevron />
                        </div>
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                        Orden por nombre
                        <div className="relative mt-1">
                          <select
                            value={draftFilters.nameOrder}
                            onChange={(event) =>
                              setDraftFilters((prev) => ({
                                ...prev,
                                nameOrder: event.target.value as NameOrder | "",
                              }))
                            }
                            className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                          >
                            <option value="">Predeterminado</option>
                            <option value="asc">A-Z</option>
                            <option value="desc">Z-A</option>
                          </select>
                          <SelectChevron />
                        </div>
                      </label>

                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                        Filtro de fecha
                        <div className="relative mt-1">
                          <select
                            value={draftFilters.dateFilterMode}
                            onChange={(event) => {
                              const nextMode = event.target.value as DateFilterMode | "";
                              setDraftFilters((prev) => ({
                                ...prev,
                                dateFilterMode: nextMode,
                                monthFrom:
                                  nextMode === "monthRange" ? prev.monthFrom : "",
                                monthTo:
                                  nextMode === "monthRange" ? prev.monthTo : "",
                                yearFrom: nextMode === "yearRange" ? prev.yearFrom : "",
                                yearTo: nextMode === "yearRange" ? prev.yearTo : "",
                                dateFrom:
                                  nextMode === "dateRange" ? prev.dateFrom : "",
                                dateTo: nextMode === "dateRange" ? prev.dateTo : "",
                                dayMonthFrom:
                                  nextMode === "monthDayRange"
                                    ? prev.dayMonthFrom
                                    : "",
                                dayMonthTo:
                                  nextMode === "monthDayRange" ? prev.dayMonthTo : "",
                              }));
                            }}
                            className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                          >
                            <option value="">Sin filtro</option>
                            <option value="thisMonth">Este mes</option>
                            <option value="thisWeek">Esta semana</option>
                            <option value="monthRange">Desde mes X hasta mes Y</option>
                            <option value="yearRange">Desde año X hasta año Y</option>
                            <option value="dateRange">
                              Desde fecha dd/mm/aaaa hasta fecha dd/mm/aaaa
                            </option>
                            <option value="monthDayRange">
                              Rango día/mes (dd/mm a dd/mm)
                            </option>
                          </select>
                          <SelectChevron />
                        </div>
                      </label>

                      {draftFilters.dateFilterMode === "monthRange" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                            Mes desde
                            <div className="relative mt-1">
                              <select
                                value={draftFilters.monthFrom}
                                onChange={(event) =>
                                  setDraftFilters((prev) => ({
                                    ...prev,
                                    monthFrom: event.target.value,
                                  }))
                                }
                                className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                              >
                                <option value="">Elegir</option>
                                {BIRTH_MONTH_OPTIONS.map((month) => (
                                  <option key={`month-from-${month.value}`} value={month.value}>
                                    {month.label}
                                  </option>
                                ))}
                              </select>
                              <SelectChevron />
                            </div>
                          </label>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                            Mes hasta
                            <div className="relative mt-1">
                              <select
                                value={draftFilters.monthTo}
                                onChange={(event) =>
                                  setDraftFilters((prev) => ({
                                    ...prev,
                                    monthTo: event.target.value,
                                  }))
                                }
                                className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                              >
                                <option value="">Elegir</option>
                                {BIRTH_MONTH_OPTIONS.map((month) => (
                                  <option key={`month-to-${month.value}`} value={month.value}>
                                    {month.label}
                                  </option>
                                ))}
                              </select>
                              <SelectChevron />
                            </div>
                          </label>
                        </div>
                      ) : null}

                      {draftFilters.dateFilterMode === "yearRange" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                            Año desde
                            <input
                              type="number"
                              min={1}
                              max={9999}
                              step={1}
                              value={draftFilters.yearFrom}
                              onChange={(event) =>
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  yearFrom: event.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                            Año hasta
                            <input
                              type="number"
                              min={1}
                              max={9999}
                              step={1}
                              value={draftFilters.yearTo}
                              onChange={(event) =>
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  yearTo: event.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                            />
                          </label>
                        </div>
                      ) : null}

                      {draftFilters.dateFilterMode === "dateRange" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                            Desde (fecha)
                            <input
                              type="date"
                              value={draftFilters.dateFrom}
                              onChange={(event) =>
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  dateFrom: event.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                            />
                          </label>
                          <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                            Hasta (fecha)
                            <input
                              type="date"
                              value={draftFilters.dateTo}
                              onChange={(event) =>
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  dateTo: event.target.value,
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                            />
                          </label>
                        </div>
                      ) : null}

                      {draftFilters.dateFilterMode === "monthDayRange" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                              Desde (mes)
                              <div className="relative mt-1">
                                <select
                                  value={fromMonthDayParts.month}
                                  onChange={(event) =>
                                    setDraftFilters((prev) => {
                                      const nextMonth = event.target.value;
                                      const current = splitDayMonthToken(prev.dayMonthFrom);
                                      if (!nextMonth) {
                                        return {
                                          ...prev,
                                          dayMonthFrom: "",
                                        };
                                      }

                                      const nextDayValue = current.day
                                        ? String(
                                            Math.min(
                                              Number(current.day),
                                              getDaysInMonth(Number(nextMonth))
                                            )
                                          )
                                        : "";

                                      return {
                                        ...prev,
                                        dayMonthFrom: buildDayMonthToken(
                                          nextMonth,
                                          nextDayValue
                                        ),
                                      };
                                    })
                                  }
                                  className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                                >
                                  <option value="">Elegir</option>
                                  {BIRTH_MONTH_OPTIONS.map((month) => (
                                    <option key={`from-day-month-${month.value}`} value={month.value}>
                                      {month.label}
                                    </option>
                                  ))}
                                </select>
                                <SelectChevron />
                              </div>
                            </label>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                              Desde (día)
                              <div className="relative mt-1">
                                <select
                                  value={fromMonthDayParts.day}
                                  onChange={(event) =>
                                    setDraftFilters((prev) => {
                                      const current = splitDayMonthToken(prev.dayMonthFrom);
                                      return {
                                        ...prev,
                                        dayMonthFrom: buildDayMonthToken(
                                          current.month,
                                          event.target.value
                                        ),
                                      };
                                    })
                                  }
                                  disabled={!fromMonthDayParts.month}
                                  className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                                >
                                  <option value="">Elegir</option>
                                  {fromDayOptions.map((day) => (
                                    <option key={`from-day-${day}`} value={day}>
                                      {day}
                                    </option>
                                  ))}
                                </select>
                                <SelectChevron />
                              </div>
                            </label>
                          </div>

                          <div className="grid gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                              Hasta (mes)
                              <div className="relative mt-1">
                                <select
                                  value={toMonthDayParts.month}
                                  onChange={(event) =>
                                    setDraftFilters((prev) => {
                                      const nextMonth = event.target.value;
                                      const current = splitDayMonthToken(prev.dayMonthTo);
                                      if (!nextMonth) {
                                        return {
                                          ...prev,
                                          dayMonthTo: "",
                                        };
                                      }

                                      const nextDayValue = current.day
                                        ? String(
                                            Math.min(
                                              Number(current.day),
                                              getDaysInMonth(Number(nextMonth))
                                            )
                                          )
                                        : "";

                                      return {
                                        ...prev,
                                        dayMonthTo: buildDayMonthToken(
                                          nextMonth,
                                          nextDayValue
                                        ),
                                      };
                                    })
                                  }
                                  className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                                >
                                  <option value="">Elegir</option>
                                  {BIRTH_MONTH_OPTIONS.map((month) => (
                                    <option key={`to-day-month-${month.value}`} value={month.value}>
                                      {month.label}
                                    </option>
                                  ))}
                                </select>
                                <SelectChevron />
                              </div>
                            </label>
                            <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                              Hasta (día)
                              <div className="relative mt-1">
                                <select
                                  value={toMonthDayParts.day}
                                  onChange={(event) =>
                                    setDraftFilters((prev) => {
                                      const current = splitDayMonthToken(prev.dayMonthTo);
                                      return {
                                        ...prev,
                                        dayMonthTo: buildDayMonthToken(
                                          current.month,
                                          event.target.value
                                        ),
                                      };
                                    })
                                  }
                                  disabled={!toMonthDayParts.month}
                                  className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                                >
                                  <option value="">Elegir</option>
                                  {toDayOptions.map((day) => (
                                    <option key={`to-day-${day}`} value={day}>
                                      {day}
                                    </option>
                                  ))}
                                </select>
                                <SelectChevron />
                              </div>
                            </label>
                          </div>
                        </div>
                      ) : null}

                      {draftFilters.dateFilterMode === "monthDayRange" ? (
                        <div className="space-y-1">
                          <p className="text-[11px] text-slate-300/80">
                            Usá formato dd/mm. Se consideran solo mes y día.
                          </p>
                          {selectedMonthDayRangeLabel ? (
                            <p className="text-[11px] font-semibold text-slate-300/90">
                              Rango seleccionado: {selectedMonthDayRangeLabel}
                              {monthDayRangeCrossesYear
                                ? " (cruza fin de año)"
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                          Área
                          <div className="relative mt-1">
                            <select
                              value={draftFilters.area}
                              onChange={(event) =>
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  area: event.target.value,
                                }))
                              }
                              disabled={isAreaTurnoFilterDisabled}
                              className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                            >
                              <option value="">Todos</option>
                              {AREA_CATEGORIES.map((area) => (
                                <option key={`filter-area-${area}`} value={area}>
                                  {area}
                                </option>
                              ))}
                            </select>
                            <SelectChevron />
                          </div>
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-300/85">
                          Turno
                          <div className="relative mt-1">
                            <select
                              value={draftFilters.turno}
                              onChange={(event) =>
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  turno: event.target.value,
                                }))
                              }
                              disabled={isAreaTurnoFilterDisabled}
                              className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-800/60 disabled:text-slate-400"
                            >
                              <option value="">Todos</option>
                              {TURNO_CATEGORIES.map((turno) => (
                                <option key={`filter-turno-${turno}`} value={turno}>
                                  {turno}
                                </option>
                              ))}
                            </select>
                            <SelectChevron />
                          </div>
                        </label>
                      </div>
                    </div>

                    {hasIncompleteMonthDayRange ? (
                      <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
                        Completá ambas fechas del rango día/mes (desde y hasta).
                      </p>
                    ) : null}
                    {hasInvalidYearRange ? (
                      <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
                        El año desde no puede ser mayor que el año hasta.
                      </p>
                    ) : null}
                    {hasInvalidDateRange ? (
                      <p className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
                        La fecha desde no puede ser mayor que la fecha hasta.
                      </p>
                    ) : null}

                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/15 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsFilterMenuOpen(false);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/15"
                      >
                        Cerrar
                      </button>
                      <button
                        type="button"
                        onClick={clearFilters}
                        disabled={activeFilterCount === 0 && !hasPendingFilterChanges}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        onClick={applyDraftFilters}
                        disabled={
                          !hasPendingFilterChanges ||
                          hasIncompleteMonthDayRange ||
                          hasInvalidYearRange ||
                          hasInvalidDateRange
                        }
                        className="inline-flex h-9 items-center justify-center rounded-full border border-sky-400 bg-sky-500 px-3 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                ) : null}

              {searchInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchQuery("");
                    setCurrentPage(1);
                    setIsSearchHistoryOpen(false);
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/15"
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>

          <p className="relative z-10 mb-3 text-xs text-slate-300/80">
            {totalRecords > 0
              ? `Mostrando ${records.length} de ${totalRecords} registros.`
              : "Sin resultados para la búsqueda actual."}
          </p>

          {isLoadingRecords ? (
            <ul className="relative z-10 space-y-2">
              {Array.from({ length: 7 }).map((_, index) => (
                <li
                  key={`record-skeleton-${index}`}
                  className="rounded-xl border border-white/15 bg-white/10 px-3 py-3 backdrop-blur-sm"
                >
                  <div className="auth-skeleton h-4 w-44 rounded" />
                  <div className="auth-skeleton mt-2 h-3 w-36 rounded" />
                  <div className="auth-skeleton mt-2 h-3 w-28 rounded" />
                </li>
              ))}
            </ul>
          ) : records.length === 0 ? (
            <p className="relative z-10 text-sm text-slate-300/90">
              Aún no hay cumpleaños cargados.
            </p>
          ) : (
            <>
              <ul className="relative z-10 space-y-2 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:max-h-none">
              {records.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {person.lastName}, {person.firstName}
                      {isBirthdayToday(person.birthDate) ? " \u{1F382}" : ""}
                    </p>
                    <p className="text-xs text-slate-300/85">
                      {formatBirthDate(person.birthDate)}
                    </p>
                    {person.area ? (
                      <p className="text-xs text-slate-300/80 break-words">
                        Área: {person.area}
                      </p>
                    ) : null}
                    {person.turno ? (
                      <p className="text-xs text-slate-300/80">
                        Turno: {person.turno}
                      </p>
                    ) : null}
                    {person.personal.category === "Policial" ? (
                      <p className="text-xs text-slate-300/80">
                        Personal policial: {formatPolicialRoleLabel(person.personal.policial)}
                        {person.personal.policial === "Oficial" &&
                        person.personal.oficialCategory
                          ? ` - ${person.personal.oficialCategory}`
                          : (person.personal.policial === "Suboficial" ||
                                person.personal.policial === "Tecnico") &&
                              person.personal.suboficialCategory
                            ? ` - ${formatSuboficialCategoryLabel(
                                person.personal.suboficialCategory,
                                person.personal.policial
                              )}`
                            : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-300/80">
                        Personal: {person.personal.category}
                      </p>
                    )}
                  </div>
                  {canManageRecords ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={deletingId === person.id || isUpdating}
                        onClick={() => {
                          openEditModal(person);
                        }}
                        className="inline-flex rounded-full border border-sky-300/35 bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === person.id || isUpdating}
                        onClick={() => {
                          void removeRecord(person.id);
                        }}
                        className="inline-flex rounded-full border border-red-300/35 bg-red-400/15 px-3 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === person.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {totalPages > 1 ? (
              <nav className="relative z-10 mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLoadingRecords}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Anterior
                </button>

                {paginationItems.map((item, index) =>
                  item === "..." ? (
                    <span
                      key={`ellipsis-${index}`}
                      className="inline-flex h-9 min-w-9 items-center justify-center px-1 text-xs text-slate-300/60"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${item}`}
                      type="button"
                      disabled={item === currentPage || isLoadingRecords}
                      onClick={() => setCurrentPage(item)}
                      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed ${
                        item === currentPage
                          ? "border-sky-400 bg-sky-500 text-slate-950 disabled:opacity-100"
                          : "border-white/20 bg-white/10 text-slate-100 hover:bg-white/15 disabled:opacity-55"
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={currentPage >= totalPages || isLoadingRecords}
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  className="inline-flex h-9 items-center justify-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  Siguiente
                </button>
              </nav>
            ) : null}
            </>
          )}
        </section>

        {canManageRecords && editingRecord ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-white/20 bg-[linear-gradient(140deg,rgba(15,23,42,0.86)_0%,rgba(15,23,42,0.74)_100%)] p-6 text-slate-100 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-md lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-100">
                    Editar cumpleaños
                  </h2>
                  <p className="mt-1 text-sm text-slate-300/85">
                    Actualizá los datos del personal seleccionado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isUpdating}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  X
                </button>
              </div>

              <form onSubmit={handleUpdateRecord} className="mt-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-slate-200/90">
                    Nombre
                    <input
                      type="text"
                      value={editFirstName}
                      onChange={(event) =>
                        setEditFirstName(sanitizePersonNameInput(event.target.value))
                      }
                      className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                      placeholder="Ej: María"
                      disabled={isUpdating}
                    />
                  </label>

                  <label className="text-sm text-slate-200/90">
                    Apellido
                    <input
                      type="text"
                      value={editLastName}
                      onChange={(event) =>
                        setEditLastName(sanitizePersonNameInput(event.target.value))
                      }
                      className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 placeholder:text-slate-400 focus:ring-2"
                      placeholder="Ej: Pérez"
                      disabled={isUpdating}
                    />
                  </label>
                </div>

                <label className="block text-sm text-slate-200/90">
                  Personal
                  <div className="relative mt-1">
                    <select
                      value={editPersonalCategory}
                      onChange={(event) => {
                        const nextCategory = event.target.value as PersonalCategory;
                        setEditPersonalCategory(nextCategory);

                        if (nextCategory === "Gobierno") {
                          setEditArea("");
                          setEditTurno("");
                        }
                        if (nextCategory !== "Policial") {
                          setEditPolicialRole("");
                        }
                      }}
                      className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                      disabled={isUpdating}
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

                {editPersonalCategory === "Policial" ? (
                  <label className="block text-sm text-slate-200/90">
                    Tipo de personal policial
                    <div className="relative mt-1">
                      <select
                        value={editPolicialRole}
                        onChange={(event) =>
                          setEditPolicialRole(event.target.value as SelectedPolicialRole)
                        }
                        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                        disabled={isUpdating}
                      >
                        <option value="" disabled hidden>
                          Elegí un tipo de personal policial
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

                {editPersonalCategory === "Policial" &&
                editPolicialRole === "Oficial" ? (
                  <label className="block text-sm text-slate-200/90">
                    Categoría de oficial
                    <div className="relative mt-1">
                      <select
                        value={editOficialCategory}
                        onChange={(event) =>
                          setEditOficialCategory(event.target.value as OficialCategory)
                        }
                        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                        disabled={isUpdating}
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

                {editPersonalCategory === "Policial" &&
                (editPolicialRole === "Suboficial" ||
                  editPolicialRole === "Tecnico") ? (
                  <label className="block text-sm text-slate-200/90">
                    {editPolicialRole === "Tecnico"
                      ? "Categoría de técnico"
                      : "Categoría de suboficial"}
                    <div className="relative mt-1">
                      <select
                        value={editSuboficialCategory}
                        onChange={(event) =>
                          setEditSuboficialCategory(
                            event.target.value as SuboficialCategory
                          )
                        }
                        className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                        disabled={isUpdating}
                      >
                        {SUBOFICIAL_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {formatSuboficialCategoryLabel(category, editPolicialRole)}
                          </option>
                        ))}
                      </select>
                      <SelectChevron />
                    </div>
                  </label>
                ) : null}

                {requiresAreaAndTurno ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-slate-200/90">
                      Área
                      <div className="relative mt-1">
                        <select
                          value={editArea}
                          onChange={(event) => setEditArea(event.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                          disabled={isUpdating}
                        >
                          <option value="" disabled hidden>
                            Elegí un área
                          </option>
                          {hasCustomArea ? (
                            <option value={editArea}>{editArea}</option>
                          ) : null}
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
                          value={editTurno}
                          onChange={(event) => setEditTurno(event.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                          disabled={isUpdating}
                        >
                          <option value="" disabled hidden>
                            Elegí un turno
                          </option>
                          {hasCustomTurno ? (
                            <option value={editTurno}>{editTurno}</option>
                          ) : null}
                          {TURNO_CATEGORIES.map((turno) => (
                            <option key={turno} value={turno}>
                              {turno}
                            </option>
                          ))}
                        </select>
                        <SelectChevron />
                      </div>
                    </label>
                  </div>
                ) : null}

                <label className="block text-sm text-slate-200/90">
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={editBirthDate}
                    onChange={(event) => setEditBirthDate(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/20 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/50 focus:ring-2"
                    disabled={isUpdating}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="inline-flex rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdating ? "Actualizando..." : "Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    disabled={isUpdating}
                    className="inline-flex rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </form>

              {editError ? (
                <p
                  className={`mt-4 rounded-xl border border-red-300/30 bg-red-400/15 px-4 py-3 text-sm text-red-100 transition-all duration-300 ease-out ${
                    isEditNoticeVisible
                      ? "translate-y-0 opacity-100"
                      : "-translate-y-1 opacity-0"
                  }`}
                >
                  {editError}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {canManageRecords && confirmationState ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/20 bg-[linear-gradient(140deg,rgba(15,23,42,0.86)_0%,rgba(15,23,42,0.74)_100%)] p-5 text-slate-100 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-100">
                {confirmationState.title}
              </h3>
              <p className="mt-2 text-sm text-slate-200/90">
                {confirmationState.description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => resolveConfirmation(false)}
                  disabled={isConfirmProcessing}
                  className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => resolveConfirmation(true)}
                  disabled={isConfirmProcessing}
                  className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    confirmationState.tone === "danger"
                      ? "bg-red-500 hover:bg-red-400"
                      : "bg-sky-500 hover:bg-sky-400"
                  }`}
                >
                  {isConfirmProcessing
                    ? "Procesando..."
                    : confirmationState.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {isDownloadPreviewOpen ? (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-[linear-gradient(140deg,rgba(15,23,42,0.86)_0%,rgba(15,23,42,0.74)_100%)] p-5 text-slate-100 shadow-[0_28px_60px_rgba(2,8,23,0.55)] backdrop-blur-md">
              <h3 className="text-lg font-bold text-slate-100">
                Descargar listado filtrado
              </h3>
              <p className="mt-2 text-sm text-slate-200/90">
                Se descargará un archivo CSV con los registros que coinciden con los
                filtros activos.
              </p>

              <div className="mt-4 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                {isPreparingDownloadPreview ? (
                  <div aria-busy="true" aria-live="polite">
                    <div className="auth-skeleton h-5 w-52 rounded" />
                    <div className="auth-skeleton mt-3 h-4 w-full rounded" />
                    <div className="auth-skeleton mt-2 h-4 w-4/5 rounded" />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="auth-skeleton h-14 rounded-xl" />
                      <div className="auth-skeleton h-14 rounded-xl" />
                    </div>
                  </div>
                ) : downloadPreviewError ? (
                  <p className="rounded-lg border border-red-300/30 bg-red-400/15 px-3 py-2 text-sm text-red-100">
                    {downloadPreviewError}
                  </p>
                ) : (
                  <div className="space-y-3 text-sm text-slate-200/90">
                    <p className="rounded-lg border border-white/15 bg-slate-900/55 px-3 py-2">
                      Archivo:{" "}
                      <span className="font-semibold text-slate-100">
                        {downloadPreviewInfo?.fileName ??
                          getFilteredRecordsDownloadFileName()}
                      </span>
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <p className="rounded-lg border border-white/15 bg-slate-900/55 px-3 py-2">
                        Registros:{" "}
                        <span className="font-semibold text-slate-100">
                          {downloadPreviewInfo?.totalMatches ?? 0}
                        </span>
                      </p>
                      <p className="rounded-lg border border-white/15 bg-slate-900/55 px-3 py-2">
                        Filtros activos:{" "}
                        <span className="font-semibold text-slate-100">
                          {activeFilterCount}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDownloadPreviewModal}
                  disabled={isDownloadingFiltered}
                  className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void downloadFilteredRecords({ closePreviewOnSuccess: true });
                  }}
                  disabled={
                    isPreparingDownloadPreview ||
                    isDownloadingFiltered ||
                    !!downloadPreviewError ||
                    (downloadPreviewInfo ? downloadPreviewInfo.totalMatches <= 0 : false)
                  }
                  className="relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDownloadingFiltered ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-slate-100/35 transition-[width] duration-150 ease-out"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  ) : null}
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {isDownloadingFiltered ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/35 border-t-slate-950" />
                        Descargando...
                      </>
                    ) : (
                      "Descargar CSV"
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}




