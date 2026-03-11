export type EfemerideType =
  | "cumpleanos"
  | "aniversario"
  | "dia"
  | "sin_novedad"
  | "otro";

export type EfemerideEvent = {
  id: string;
  year: number;
  month: number;
  day: number;
  type: EfemerideType;
  title: string;
  birthdayId?: string;
  areaLabel?: string;
};

export type EfemeridesImportPayload = {
  sourceName: string;
  month: number;
  year: number;
  importedAt: string;
  events: EfemerideEvent[];
};

export type EfemeridesStoredPayload = EfemeridesImportPayload & {
  eventCount: number;
};

export const EFEMERIDES_BROADCAST_EVENT = "efemerides-updated";

const MONTH_MAP: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

function normalizeWord(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferType(keyword: string): EfemerideType {
  const normalized = normalizeWord(keyword);

  if (normalized === "CUMPLEANOS") return "cumpleanos";
  if (normalized === "ANIVERSARIO") return "aniversario";
  if (normalized === "DIA") return "dia";
  if (normalized === "SIN NOVEDAD") return "sin_novedad";
  return "otro";
}

function normalizeKeyword(keyword: string) {
  const normalized = normalizeWord(keyword);

  if (normalized === "CUMPLEANOS") return "CUMPLEA\u00d1OS";
  if (normalized === "ANIVERSARIO") return "ANIVERSARIO";
  if (normalized === "DIA") return "D\u00cdA";
  if (normalized === "SIN NOVEDAD") return "SIN NOVEDAD";
  return keyword.toUpperCase();
}

function detectMonthYear(
  originalText: string,
  fallbackMonth: number,
  fallbackYear: number
) {
  const headerRegex =
    /MES\s+DE\s+([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1]+)\s+(\d{4})/i;
  const match = originalText.match(headerRegex);

  if (!match) {
    return { month: fallbackMonth, year: fallbackYear };
  }

  const monthName = normalizeWord(match[1]);
  const month = MONTH_MAP[monthName] ?? fallbackMonth;
  const parsedYear = Number(match[2]);
  const year = Number.isInteger(parsedYear) ? parsedYear : fallbackYear;

  return { month, year };
}

export function parseEfemeridesText(
  originalText: string,
  sourceName: string,
  fallbackMonth: number,
  fallbackYear: number
): EfemeridesImportPayload {
  const detected = detectMonthYear(originalText, fallbackMonth, fallbackYear);
  const footerMatch = originalText.match(/POR\s+FAVOR/i);
  const scopedText = footerMatch
    ? originalText.slice(0, footerMatch.index)
    : originalText;
  const text = normalizeText(scopedText);

  const eventPattern =
    /(\b\d{1,2})\s+(CUMPLEA\u00d1OS|ANIVERSARIO|D[I\u00cd]A|SIN\s+NOVEDAD)\b([\s\S]*?)(?=(?:\b\d{1,2}\s+(?:CUMPLEA\u00d1OS|ANIVERSARIO|D[I\u00cd]A|SIN\s+NOVEDAD)\b)|$)/gi;

  const events: EfemerideEvent[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = eventPattern.exec(text)) !== null) {
    const day = Number(match[1]);

    if (!Number.isInteger(day) || day < 1 || day > 31) {
      continue;
    }

    const keyword = normalizeKeyword(match[2]);
    const details = normalizeText(match[3]);
    const type = inferType(match[2]);
    const title =
      type === "sin_novedad"
        ? "SIN NOVEDAD"
        : normalizeText(`${keyword} ${details}`.trim());

    events.push({
      id: `${detected.year}-${detected.month}-${day}-${idx}`,
      year: detected.year,
      month: detected.month,
      day,
      type,
      title,
    });

    idx += 1;
  }

  return {
    sourceName,
    month: detected.month,
    year: detected.year,
    importedAt: new Date().toISOString(),
    events,
  };
}

export function shouldClearEfemeridesForYear(
  payloadYear: number,
  currentYear = new Date().getFullYear()
) {
  if (!Number.isInteger(payloadYear)) {
    return true;
  }

  return payloadYear !== currentYear;
}
