import { NextResponse } from "next/server";
import { requireRoleSession } from "@/lib/auth/server-auth";
import {
  readSupabaseErrorMessage,
  SupabaseConfigError,
  supabaseRestFetch,
} from "@/lib/supabase-rest";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const BIRTHDAY_SELECT =
  "id,first_name,last_name,birth_date,area,turno,personal_category,policial_role,oficial_category,suboficial_category";
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 100;

type PersonalCategory = "Policial" | "Civil" | "Gobierno";
type PolicialRole = "Oficial" | "Suboficial" | "Tecnico" | "Civil";
type NameOrder = "asc" | "desc";
type DateFilterMode =
  | "thisMonth"
  | "thisWeek"
  | "monthRange"
  | "yearRange"
  | "dateRange"
  | "monthDayRange";

type BirthdayRecordResponse = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  area?: string;
  turno?: string;
  personal:
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
};

type BirthdayInsertPayload = {
  first_name: string;
  last_name: string;
  birth_date: string;
  area: string | null;
  turno: string | null;
  personal_category: PersonalCategory;
  policial_role: PolicialRole | null;
  oficial_category: string | null;
  suboficial_category: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeInputText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeInputText(value);
  return normalized.length > 0 ? normalized : null;
}

function sanitizePersonName(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  const sanitized = parsed
    .replace(/[^\p{L}\p{M}\s.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.length > 0 ? sanitized : null;
}

function asIsoDateString(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    return null;
  }

  return parsed;
}

function isPersonalCategory(value: string): value is PersonalCategory {
  return value === "Policial" || value === "Civil" || value === "Gobierno";
}

function isPolicialRole(value: string): value is PolicialRole {
  return (
    value === "Oficial" ||
    value === "Suboficial" ||
    value === "Tecnico" ||
    value === "Civil"
  );
}

function isFutureDate(isoDate: string) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return isoDate > todayIso;
}

function normalizeBirthdayFromRow(row: unknown): BirthdayRecordResponse | null {
  const parsed = asRecord(row);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const firstName =
    asNonEmptyString(parsed.first_name) ?? asNonEmptyString(parsed.firstName);
  const lastName =
    asNonEmptyString(parsed.last_name) ?? asNonEmptyString(parsed.lastName);
  const birthDate =
    asIsoDateString(parsed.birth_date) ?? asIsoDateString(parsed.birthDate);

  if (!id || !firstName || !lastName || !birthDate) {
    return null;
  }

  const rawPersonal = asRecord(parsed.personal);
  const rawCategory =
    asNonEmptyString(parsed.personal_category) ??
    asNonEmptyString(parsed.personalCategory) ??
    asNonEmptyString(rawPersonal?.category);
  const category: PersonalCategory =
    rawCategory && isPersonalCategory(rawCategory) ? rawCategory : "Civil";

  const area =
    asNonEmptyString(parsed.area) ?? asNonEmptyString(parsed.areaCategory);
  const turno =
    asNonEmptyString(parsed.turno) ?? asNonEmptyString(parsed.turnoCategory);

  const personal: BirthdayRecordResponse["personal"] =
    category === "Policial"
      ? (() => {
          const rawRole =
            asNonEmptyString(parsed.policial_role) ??
            asNonEmptyString(rawPersonal?.policial) ??
            asNonEmptyString(rawPersonal?.policialRole);
          const role: PolicialRole =
            rawRole && isPolicialRole(rawRole) ? rawRole : "Civil";
          const oficialCategory =
            asNonEmptyString(parsed.oficial_category) ??
            asNonEmptyString(rawPersonal?.oficialCategory);
          const suboficialCategory =
            asNonEmptyString(parsed.suboficial_category) ??
            asNonEmptyString(rawPersonal?.suboficialCategory);

          return {
            category: "Policial",
            policial: role,
            oficialCategory: role === "Oficial" ? oficialCategory ?? undefined : undefined,
            suboficialCategory:
              role === "Suboficial" || role === "Tecnico"
                ? suboficialCategory ?? undefined
                : undefined,
          };
        })()
      : category === "Gobierno"
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
    area: area ?? undefined,
    turno: turno ?? undefined,
    personal,
  };
}

function parseInsertPayload(body: unknown): { payload: BirthdayInsertPayload } | { error: string } {
  const parsed = asRecord(body);
  if (!parsed) {
    return { error: "Cuerpo de solicitud invÃ¡lido." };
  }

  const firstName = sanitizePersonName(parsed.firstName);
  const lastName = sanitizePersonName(parsed.lastName);
  const birthDate = asIsoDateString(parsed.birthDate);
  const area = asNonEmptyString(parsed.area);
  const turno = asNonEmptyString(parsed.turno);
  const personal = asRecord(parsed.personal);

  if (!firstName || !lastName || !birthDate || !personal) {
    return { error: "Faltan campos obligatorios para guardar el cumpleaÃ±os." };
  }

  if (isFutureDate(birthDate)) {
    return { error: "La fecha de nacimiento no puede ser futura." };
  }

  const categoryRaw = asNonEmptyString(personal.category);
  if (!categoryRaw || !isPersonalCategory(categoryRaw)) {
    return { error: "CategorÃ­a de personal invÃ¡lida." };
  }

  if (categoryRaw === "Gobierno") {
    return {
      payload: {
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        area: null,
        turno: null,
        personal_category: categoryRaw,
        policial_role: null,
        oficial_category: null,
        suboficial_category: null,
      },
    };
  }

  if (!area || !turno) {
    return {
      error:
        "Los campos area y turno son obligatorios.",
    };
  }

  if (categoryRaw !== "Policial") {
    return {
      payload: {
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        area: area,
        turno: turno,
        personal_category: categoryRaw,
        policial_role: null,
        oficial_category: null,
        suboficial_category: null,
      },
    };
  }

  const roleRaw =
    asNonEmptyString(personal.policial) ??
    asNonEmptyString(personal.policialRole);
  if (!roleRaw || !isPolicialRole(roleRaw)) {
    return { error: "Selecciona un tipo de personal policial vÃ¡lido." };
  }

  return {
    payload: {
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      area: area,
      turno: turno,
      personal_category: "Policial",
      policial_role: roleRaw,
      oficial_category:
        roleRaw === "Oficial"
          ? asNonEmptyString(personal.oficialCategory) ?? null
          : null,
      suboficial_category:
        roleRaw === "Suboficial" || roleRaw === "Tecnico"
          ? asNonEmptyString(personal.suboficialCategory) ?? null
          : null,
    },
  };
}

type ListPathOptions = {
  id: string | null;
  search: string | null;
  personalCategory: PersonalCategory | null;
  policialRole: PolicialRole | null;
  area: string | null;
  turno: string | null;
  nameOrder: NameOrder | null;
  limit: number | null;
  offset: number | null;
};

function sanitizeOrSearchTerm(value: string) {
  return value
    .replace(/[(),]/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeColumnSearchTerm(value: string) {
  return value.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function listPath(options?: Partial<ListPathOptions>) {
  const params = new URLSearchParams();
  params.set("select", BIRTHDAY_SELECT);
  const idFilter = asNonEmptyString(options?.id ?? null);
  if (idFilter) {
    params.set("id", `eq.${idFilter}`);
  }
  const nameOrder = options?.nameOrder ?? null;
  if (nameOrder === "asc" || nameOrder === "desc") {
    params.append("order", `last_name.${nameOrder}`);
    params.append("order", `first_name.${nameOrder}`);
    params.append("order", "birth_date.asc");
  } else {
    params.append("order", "birth_date.asc");
    params.append("order", "last_name.asc");
    params.append("order", "first_name.asc");
  }

  const rawSearch = asNonEmptyString(options?.search ?? null);
  const search = rawSearch ? sanitizeOrSearchTerm(rawSearch) : "";
  if (search) {
    const pattern = `*${search}*`;
    params.set(
      "or",
      `(${[
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `area.ilike.${pattern}`,
        `turno.ilike.${pattern}`,
      ].join(",")})`
    );
  }

  const personalCategory = options?.personalCategory ?? null;
  if (personalCategory) {
    params.set("personal_category", `eq.${personalCategory}`);
  }

  const policialRole = options?.policialRole ?? null;
  if (policialRole) {
    if (!personalCategory) {
      params.set("personal_category", "eq.Policial");
    }
    params.set("policial_role", `eq.${policialRole}`);
  }

  const areaFilter = sanitizeColumnSearchTerm(options?.area ?? "");
  if (areaFilter) {
    params.set("area", `ilike.*${areaFilter}*`);
  }

  const turnoFilter = sanitizeColumnSearchTerm(options?.turno ?? "");
  if (turnoFilter) {
    params.set("turno", `ilike.*${turnoFilter}*`);
  }

  if (typeof options?.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }

  if (typeof options?.offset === "number" && options.offset >= 0) {
    params.set("offset", String(options.offset));
  }

  if (idFilter && !params.has("limit")) {
    params.set("limit", "1");
  }

  return `birthdays?${params.toString()}`;
}

function insertPath() {
  const params = new URLSearchParams();
  params.set("select", BIRTHDAY_SELECT);
  return `birthdays?${params.toString()}`;
}

function setNullableExactFilter(
  params: URLSearchParams,
  column: string,
  value: string | null
) {
  params.set(column, value === null ? "is.null" : `eq.${value}`);
}

function duplicateLookupPath(payload: BirthdayInsertPayload, excludedId?: string) {
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("limit", "1");
  if (excludedId) {
    params.set("id", `neq.${excludedId}`);
  }
  params.set("first_name", `eq.${payload.first_name}`);
  params.set("last_name", `eq.${payload.last_name}`);
  params.set("birth_date", `eq.${payload.birth_date}`);
  params.set("personal_category", `eq.${payload.personal_category}`);
  setNullableExactFilter(params, "area", payload.area);
  setNullableExactFilter(params, "turno", payload.turno);
  setNullableExactFilter(params, "policial_role", payload.policial_role);
  setNullableExactFilter(params, "oficial_category", payload.oficial_category);
  setNullableExactFilter(params, "suboficial_category", payload.suboficial_category);
  return `birthdays?${params.toString()}`;
}

function updatePath(id: string) {
  const params = new URLSearchParams();
  params.set("id", `eq.${id}`);
  params.set("select", BIRTHDAY_SELECT);
  return `birthdays?${params.toString()}`;
}

function formatRouteError(caught: unknown, fallback: string) {
  if (caught instanceof SupabaseConfigError) {
    return caught.message;
  }

  if (caught instanceof Error) {
    return caught.message;
  }

  return fallback;
}

type MonthDayQuery =
  | { kind: "all" }
  | { kind: "day"; month: number; day: number }
  | { kind: "invalid" };

type ListFilters = {
  personalCategory: PersonalCategory | null;
  policialRole: PolicialRole | null;
  area: string | null;
  turno: string | null;
  dateMode: DateFilterMode | null;
  monthFrom: number | null;
  monthTo: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  dayMonthFrom: string | null;
  dayMonthTo: string | null;
  nameOrder: NameOrder | null;
};

type ListQuery =
  | {
      kind: "valid";
      search: string | null;
      filters: ListFilters;
      page: number;
      pageSize: number;
      paginated: boolean;
    }
  | {
      kind: "invalid";
      error: string;
    };

function parseMonthDayQuery(url: string): MonthDayQuery {
  const { searchParams } = new URL(url);
  const monthRaw = searchParams.get("month");
  const dayRaw = searchParams.get("day");

  if (monthRaw === null && dayRaw === null) {
    return { kind: "all" };
  }

  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return { kind: "invalid" };
  }

  return { kind: "day", month, day };
}

function matchesMonthDay(birthDateIso: string, month: number, day: number) {
  const parts = birthDateIso.split("-").map(Number);
  if (parts.length !== 3) {
    return false;
  }

  return parts[1] === month && parts[2] === day;
}

function parseBirthDateParts(birthDateIso: string) {
  const parts = birthDateIso.split("-").map(Number);
  if (
    parts.length !== 3 ||
    parts.some((part) => Number.isNaN(part)) ||
    parts[1] < 1 ||
    parts[1] > 12 ||
    parts[2] < 1 ||
    parts[2] > 31
  ) {
    return null;
  }

  return {
    year: parts[0],
    month: parts[1],
    day: parts[2],
  };
}

function isDateFilterMode(value: string): value is DateFilterMode {
  return (
    value === "thisMonth" ||
    value === "thisWeek" ||
    value === "monthRange" ||
    value === "yearRange" ||
    value === "dateRange" ||
    value === "monthDayRange"
  );
}

function parseMonthQueryParam(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    return null;
  }

  return parsed;
}

function parseYearQueryParam(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9999) {
    return null;
  }

  return parsed;
}

function parseDayMonthToken(value: string | null) {
  if (!value || !/^\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [monthRaw, dayRaw] = value.split("-");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const utcDate = new Date(Date.UTC(2000, month - 1, day));
  if (
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    token: `${monthRaw}-${dayRaw}`,
    month,
    day,
  };
}

function dayMonthOrdinal(month: number, day: number) {
  const start = Date.UTC(2000, 0, 1);
  const current = Date.UTC(2000, month - 1, day);
  return Math.floor((current - start) / (24 * 60 * 60 * 1000)) + 1;
}

function currentWeekOrdinalRange() {
  const now = new Date();
  const currentOrdinal = dayMonthOrdinal(now.getMonth() + 1, now.getDate());
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const daysUntilSunday = 6 - daysSinceMonday;
  const totalDays = 366;
  const fromOrdinal =
    ((currentOrdinal - daysSinceMonday - 1 + totalDays) % totalDays) + 1;
  const toOrdinal = ((currentOrdinal + daysUntilSunday - 1) % totalDays) + 1;
  return { fromOrdinal, toOrdinal };
}

function isRangeMatch(value: number, from: number, to: number) {
  if (from <= to) {
    return value >= from && value <= to;
  }

  return value >= from || value <= to;
}

function matchesDateFilters(
  birthDateIso: string,
  filters: Pick<
    ListFilters,
    | "dateMode"
    | "monthFrom"
    | "monthTo"
    | "yearFrom"
    | "yearTo"
    | "dateFrom"
    | "dateTo"
    | "dayMonthFrom"
    | "dayMonthTo"
  >
) {
  if (filters.dateMode === null) {
    return true;
  }

  const parts = parseBirthDateParts(birthDateIso);
  if (!parts) {
    return false;
  }

  if (filters.dateMode === "thisMonth") {
    return parts.month === new Date().getMonth() + 1;
  }

  if (filters.dateMode === "thisWeek") {
    const targetOrdinal = dayMonthOrdinal(parts.month, parts.day);
    const { fromOrdinal, toOrdinal } = currentWeekOrdinalRange();
    return isRangeMatch(targetOrdinal, fromOrdinal, toOrdinal);
  }

  if (filters.dateMode === "monthRange") {
    if (filters.monthFrom === null || filters.monthTo === null) {
      return true;
    }

    return isRangeMatch(parts.month, filters.monthFrom, filters.monthTo);
  }

  if (filters.dateMode === "yearRange") {
    if (filters.yearFrom === null || filters.yearTo === null) {
      return true;
    }

    return parts.year >= filters.yearFrom && parts.year <= filters.yearTo;
  }

  if (filters.dateMode === "dateRange") {
    if (filters.dateFrom === null || filters.dateTo === null) {
      return true;
    }

    return birthDateIso >= filters.dateFrom && birthDateIso <= filters.dateTo;
  }

  if (filters.dateMode === "monthDayRange") {
    if (filters.dayMonthFrom === null || filters.dayMonthTo === null) {
      return true;
    }

    const from = parseDayMonthToken(filters.dayMonthFrom);
    const to = parseDayMonthToken(filters.dayMonthTo);
    if (!from || !to) {
      return true;
    }

    const targetOrdinal = dayMonthOrdinal(parts.month, parts.day);
    const fromOrdinal = dayMonthOrdinal(from.month, from.day);
    const toOrdinal = dayMonthOrdinal(to.month, to.day);
    return isRangeMatch(targetOrdinal, fromOrdinal, toOrdinal);
  }

  return true;
}

function parsePositiveInteger(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parseIdQuery(url: string) {
  const { searchParams } = new URL(url);
  return asNonEmptyString(searchParams.get("id"));
}

function parseListQuery(url: string): ListQuery {
  const { searchParams } = new URL(url);
  const search = asNonEmptyString(searchParams.get("q"));
  const personalCategoryRaw = asNonEmptyString(searchParams.get("category"));
  const personalCategory =
    personalCategoryRaw && isPersonalCategory(personalCategoryRaw)
      ? personalCategoryRaw
      : null;
  if (personalCategoryRaw && !personalCategory) {
    return {
      kind: "invalid",
      error:
        "El parametro category debe ser Policial, Civil o Gobierno.",
    };
  }

  const policialRoleRaw = asNonEmptyString(searchParams.get("role"));
  const policialRole =
    policialRoleRaw && isPolicialRole(policialRoleRaw) ? policialRoleRaw : null;
  if (policialRoleRaw && !policialRole) {
    return {
      kind: "invalid",
      error:
        "El parametro role debe ser Oficial, Suboficial, Tecnico o Civil.",
    };
  }

  if (personalCategory && personalCategory !== "Policial" && policialRole) {
    return {
      kind: "invalid",
      error:
        "No se puede usar role cuando category es Civil o Gobierno.",
    };
  }

  const area = asNonEmptyString(searchParams.get("area"));
  const turno = asNonEmptyString(searchParams.get("turno"));
  const dateModeRaw = asNonEmptyString(searchParams.get("dateMode"));
  const dateMode =
    dateModeRaw === null
      ? null
      : isDateFilterMode(dateModeRaw)
        ? dateModeRaw
        : null;
  if (dateModeRaw !== null && dateMode === null) {
    return {
      kind: "invalid",
      error:
        "El parametro dateMode debe ser thisMonth, thisWeek, monthRange, yearRange, dateRange o monthDayRange.",
    };
  }

  const monthFrom = parseMonthQueryParam(asNonEmptyString(searchParams.get("monthFrom")));
  const monthTo = parseMonthQueryParam(asNonEmptyString(searchParams.get("monthTo")));
  const yearFrom = parseYearQueryParam(asNonEmptyString(searchParams.get("yearFrom")));
  const yearTo = parseYearQueryParam(asNonEmptyString(searchParams.get("yearTo")));
  const dateFrom = asIsoDateString(asNonEmptyString(searchParams.get("dateFrom")));
  const dateTo = asIsoDateString(asNonEmptyString(searchParams.get("dateTo")));
  const dayMonthFrom = asNonEmptyString(searchParams.get("dayMonthFrom"));
  const dayMonthTo = asNonEmptyString(searchParams.get("dayMonthTo"));

  if (dateMode === "monthRange") {
    if (monthFrom === null || monthTo === null) {
      return {
        kind: "invalid",
        error:
          "Para dateMode=monthRange debes enviar monthFrom y monthTo entre 1 y 12.",
      };
    }
  }

  if (dateMode === "yearRange") {
    if (yearFrom === null || yearTo === null) {
      return {
        kind: "invalid",
        error:
          "Para dateMode=yearRange debes enviar yearFrom y yearTo.",
      };
    }

    if (yearFrom > yearTo) {
      return {
        kind: "invalid",
        error: "yearFrom no puede ser mayor que yearTo.",
      };
    }
  }

  if (dateMode === "dateRange") {
    if (dateFrom === null || dateTo === null) {
      return {
        kind: "invalid",
        error:
          "Para dateMode=dateRange debes enviar dateFrom y dateTo con formato YYYY-MM-DD.",
      };
    }

    if (dateFrom > dateTo) {
      return {
        kind: "invalid",
        error: "dateFrom no puede ser mayor que dateTo.",
      };
    }
  }

  if (dateMode === "monthDayRange") {
    const parsedFrom = parseDayMonthToken(dayMonthFrom);
    const parsedTo = parseDayMonthToken(dayMonthTo);
    if (!parsedFrom || !parsedTo) {
      return {
        kind: "invalid",
        error:
          "Para dateMode=monthDayRange debes enviar dayMonthFrom y dayMonthTo con formato MM-DD.",
      };
    }
  }

  const nameOrderRaw = asNonEmptyString(searchParams.get("nameOrder"));
  const nameOrder: NameOrder | null =
    nameOrderRaw === "asc" || nameOrderRaw === "desc"
      ? (nameOrderRaw as NameOrder)
      : null;
  if (nameOrderRaw && !nameOrder) {
    return {
      kind: "invalid",
      error: "El parametro nameOrder debe ser asc o desc.",
    };
  }
  const filters = {
    personalCategory,
    policialRole,
    area,
    turno,
    dateMode,
    monthFrom,
    monthTo,
    yearFrom,
    yearTo,
    dateFrom,
    dateTo,
    dayMonthFrom,
    dayMonthTo,
    nameOrder,
  };

  const pageRaw = searchParams.get("page");
  const limitRaw = searchParams.get("limit");
  const hasPaginationParams = pageRaw !== null || limitRaw !== null;

  if (!hasPaginationParams) {
    return {
      kind: "valid",
      search,
      filters,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      paginated: false,
    };
  }

  const page = pageRaw === null ? 1 : parsePositiveInteger(pageRaw);
  if (page === null) {
    return {
      kind: "invalid",
      error: "El parametro page debe ser un numero entero mayor o igual a 1.",
    };
  }

  const requestedPageSize =
    limitRaw === null ? DEFAULT_PAGE_SIZE : parsePositiveInteger(limitRaw);
  if (requestedPageSize === null) {
    return {
      kind: "invalid",
      error: "El parametro limit debe ser un numero entero mayor o igual a 1.",
    };
  }

  return {
    kind: "valid",
    search,
    filters,
    page,
    pageSize: Math.min(requestedPageSize, MAX_PAGE_SIZE),
    paginated: true,
  };
}

function parseContentRangeTotal(contentRange: string | null) {
  if (!contentRange) {
    return null;
  }

  const separatorIndex = contentRange.indexOf("/");
  if (separatorIndex < 0) {
    return null;
  }

  const totalRaw = contentRange.slice(separatorIndex + 1).trim();
  if (totalRaw === "*") {
    return null;
  }

  const total = Number(totalRaw);
  if (!Number.isInteger(total) || total < 0) {
    return null;
  }

  return total;
}

export async function GET(request: Request) {
  try {
    const idFilter = parseIdQuery(request.url);
    const query = parseMonthDayQuery(request.url);
    const listQuery = parseListQuery(request.url);

    if (query.kind === "invalid") {
      return NextResponse.json(
        { error: "ParÃ¡metros de fecha invÃ¡lidos." },
        { status: 400 }
      );
    }

    if (listQuery.kind === "invalid") {
      return NextResponse.json({ error: listQuery.error }, { status: 400 });
    }

    const needsInMemoryFilter =
      query.kind === "day" ||
      listQuery.filters.dateMode !== null;
    const shouldRequestExactCount = listQuery.paginated && !needsInMemoryFilter;

    const response = await supabaseRestFetch(
      listPath({
        id: idFilter,
        search: listQuery.search,
        personalCategory: listQuery.filters.personalCategory,
        policialRole: listQuery.filters.policialRole,
        area: listQuery.filters.area,
        turno: listQuery.filters.turno,
        nameOrder: listQuery.filters.nameOrder,
        limit:
          listQuery.paginated && !needsInMemoryFilter
            ? listQuery.pageSize
            : null,
        offset:
          listQuery.paginated && !needsInMemoryFilter
          ? (listQuery.page - 1) * listQuery.pageSize
          : null,
      }),
      shouldRequestExactCount
        ? {
            headers: {
              Prefer: "count=exact",
            },
          }
        : undefined
    );

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudieron consultar los cumpleaÃ±os."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const body = (await response.json()) as unknown;
    const rows = Array.isArray(body) ? body : [];
    const normalizedAll = rows
      .map((row) => normalizeBirthdayFromRow(row))
      .filter((row): row is BirthdayRecordResponse => row !== null);
    const filteredRows =
      query.kind === "day"
        ? normalizedAll.filter((row) =>
            matchesMonthDay(row.birthDate, query.month, query.day)
          )
        : normalizedAll;
    const normalized = filteredRows.filter((row) =>
      matchesDateFilters(row.birthDate, listQuery.filters)
    );
    const paginatedData =
      listQuery.paginated && needsInMemoryFilter
        ? normalized.slice(
            (listQuery.page - 1) * listQuery.pageSize,
            listQuery.page * listQuery.pageSize
          )
        : normalized;
    const total =
      listQuery.paginated && !needsInMemoryFilter
        ? parseContentRangeTotal(response.headers.get("content-range")) ??
          paginatedData.length
        : normalized.length;
    const totalPages =
      listQuery.paginated
        ? total === 0
          ? 0
          : Math.ceil(total / listQuery.pageSize)
        : normalized.length > 0
          ? 1
          : 0;

    return NextResponse.json(
      {
        data: paginatedData,
        pagination: {
          page: listQuery.page,
          pageSize: listQuery.paginated ? listQuery.pageSize : paginatedData.length,
          total,
          totalPages,
        },
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al consultar cumpleaÃ±os."
        ),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json()) as unknown;
    const parsed = parseInsertPayload(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const duplicateLookupResponse = await supabaseRestFetch(
      duplicateLookupPath(parsed.payload)
    );

    if (!duplicateLookupResponse.ok) {
      const message = await readSupabaseErrorMessage(
        duplicateLookupResponse,
        "No se pudo validar si el cumpleanos ya existe."
      );
      return NextResponse.json(
        { error: message },
        { status: duplicateLookupResponse.status }
      );
    }

    const duplicateRows = (await duplicateLookupResponse.json()) as unknown;
    const alreadyExists =
      Array.isArray(duplicateRows) && duplicateRows.length > 0;

    if (alreadyExists) {
      return NextResponse.json(
        {
          error:
            "El personal que estas intentando cargar ya existe en la Base de Datos de Garden.",
        },
        { status: 409 }
      );
    }

    const response = await supabaseRestFetch(insertPath(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(parsed.payload),
    });

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo guardar el cumpleaÃ±os."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const insertedRows = (await response.json()) as unknown;
    const firstInserted =
      Array.isArray(insertedRows) && insertedRows.length > 0
        ? normalizeBirthdayFromRow(insertedRows[0])
        : null;

    if (!firstInserted) {
      return NextResponse.json(
        { error: "El servidor no devolviÃ³ un registro vÃ¡lido." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { data: firstInserted },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(caught, "Error inesperado al guardar cumpleaÃ±os."),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = asNonEmptyString(searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "Debes indicar el ID del cumpleaÃ±os a actualizar." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as unknown;
    const parsed = parseInsertPayload(body);

    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const duplicateLookupResponse = await supabaseRestFetch(
      duplicateLookupPath(parsed.payload, id)
    );

    if (!duplicateLookupResponse.ok) {
      const message = await readSupabaseErrorMessage(
        duplicateLookupResponse,
        "No se pudo validar si el cumpleanos ya existe."
      );
      return NextResponse.json(
        { error: message },
        { status: duplicateLookupResponse.status }
      );
    }

    const duplicateRows = (await duplicateLookupResponse.json()) as unknown;
    const alreadyExists =
      Array.isArray(duplicateRows) && duplicateRows.length > 0;

    if (alreadyExists) {
      return NextResponse.json(
        {
          error:
            "El personal que estas intentando cargar ya existe en la Base de Datos de Garden.",
        },
        { status: 409 }
      );
    }

    const response = await supabaseRestFetch(updatePath(id), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(parsed.payload),
    });

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo actualizar el cumpleaÃ±os."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const updatedRows = (await response.json()) as unknown;
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      return NextResponse.json(
        { error: "No se encontrÃ³ el cumpleaÃ±os a actualizar." },
        { status: 404 }
      );
    }

    const firstUpdated = normalizeBirthdayFromRow(updatedRows[0]);
    if (!firstUpdated) {
      return NextResponse.json(
        { error: "El servidor no devolviÃ³ un registro actualizado vÃ¡lido." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { data: firstUpdated },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al actualizar cumpleaÃ±os."
        ),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = asNonEmptyString(searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "Debes indicar el ID del cumpleaÃ±os a eliminar." },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.set("id", `eq.${id}`);

    const response = await supabaseRestFetch(`birthdays?${params.toString()}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    });

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo eliminar el cumpleaÃ±os."
      );
      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al eliminar cumpleaÃ±os."
        ),
      },
      { status: 500 }
    );
  }
}
