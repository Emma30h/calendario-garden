import { NextResponse } from "next/server";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { requireRoleSession } from "@/lib/auth/server-auth";
import { parseEfemeridesText } from "@/lib/efemerides";
import {
  EfemeridesConflictError,
  saveEfemeridesForMonth,
} from "@/lib/efemerides-store";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const fallbackMonth = Number(formData.get("fallbackMonth") ?? 3);
    const fallbackYear = Number(formData.get("fallbackYear") ?? 2026);
    const replaceExisting = formData.get("replaceExisting") === "1";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "El archivo debe ser un PDF." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const extracted = await pdf(buffer);

    if (!extracted.text?.trim()) {
      return NextResponse.json(
        { error: "No se pudo extraer texto del PDF." },
        { status: 422 }
      );
    }

    const parsed = parseEfemeridesText(
      extracted.text,
      file.name,
      fallbackMonth,
      fallbackYear
    );
    const incomingSummary = {
      sourceName: parsed.sourceName,
      month: parsed.month,
      year: parsed.year,
      eventCount: parsed.events.length,
    };

    try {
      const { stored, mode } = await saveEfemeridesForMonth(parsed, {
        replace: replaceExisting,
      });

      return NextResponse.json(
        {
          ...stored,
          replaced: mode === "replace",
        },
        {
          headers: NO_STORE_HEADERS,
        }
      );
    } catch (error) {
      if (error instanceof EfemeridesConflictError) {
        return NextResponse.json(
          {
            error:
              "Ya existe un PDF cargado para ese mes. Podés reemplazarlo desde la configuración.",
            conflict: error.existing,
            incoming: incomingSummary,
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          }
        );
      }

      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al procesar el archivo.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
