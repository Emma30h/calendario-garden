import { NextResponse } from "next/server";
import { requireRoleSession } from "@/lib/auth/server-auth";
import {
  clearEfemeridesStore,
  deleteEfemeridesForMonth,
  readEfemeridesForMonth,
  readLatestEfemerides,
} from "@/lib/efemerides-store";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type MonthQuery =
  | { kind: "all" }
  | { kind: "month"; year: number; month: number }
  | { kind: "invalid" };

function parseMonthQuery(url: string): MonthQuery {
  const { searchParams } = new URL(url);
  const monthRaw = searchParams.get("month");
  const yearRaw = searchParams.get("year");

  if (monthRaw === null && yearRaw === null) {
    return { kind: "all" };
  }

  const month = Number(monthRaw);
  const year = Number(yearRaw);

  if (
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12
  ) {
    return { kind: "invalid" };
  }

  return { kind: "month", month, year };
}

export async function GET(request: Request) {
  try {
    const query = parseMonthQuery(request.url);

    if (query.kind === "invalid") {
      return NextResponse.json(
        { error: "Parámetros de mes/año inválidos." },
        { status: 400 }
      );
    }

    const data =
      query.kind === "month"
        ? await readEfemeridesForMonth({
            year: query.year,
            month: query.month,
          })
        : await readLatestEfemerides();

    return NextResponse.json(
      { data },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al leer efemérides.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const query = parseMonthQuery(request.url);

    if (query.kind === "invalid") {
      return NextResponse.json(
        { error: "Parámetros de mes/año inválidos." },
        { status: 400 }
      );
    }

    if (query.kind === "month") {
      const removed = await deleteEfemeridesForMonth({
        year: query.year,
        month: query.month,
      });

      return NextResponse.json(
        { ok: true, removed },
        {
          headers: NO_STORE_HEADERS,
        }
      );
    }

    await clearEfemeridesStore();
    return NextResponse.json(
      { ok: true, removed: true },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al limpiar efemérides.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
