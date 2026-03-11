export const YEAR = 2026;
export const WEEK_DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const COMPACT_WEEK_DAYS = ["D", "L", "M", "X", "J", "V", "S"];
export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function buildMonthCells(year: number, monthIndex: number) {
  const firstDayOfMonth = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leading = Array.from({ length: firstDayOfMonth }, () => null);
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const trailingCount = (7 - ((leading.length + days.length) % 7)) % 7;
  const trailing = Array.from({ length: trailingCount }, () => null);

  return [...leading, ...days, ...trailing];
}

export function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function parseMonthNumber(value: string) {
  const month = Number(value);
  const isInt = Number.isInteger(month);

  if (!isInt || month < 1 || month > 12) {
    return null;
  }

  return month;
}

export function parseDayNumber(value: string, maxDay: number) {
  const day = Number(value);
  const isInt = Number.isInteger(day);

  if (!isInt || day < 1 || day > maxDay) {
    return null;
  }

  return day;
}
