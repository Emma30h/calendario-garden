"use client";

import Link from "next/link";

export default function AnnualBirthdaysSettings() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section className="rounded-2xl border border-white/15 bg-white/8 p-4 shadow-[0_10px_24px_rgba(2,8,23,0.28)] backdrop-blur-sm">
        <h3 className="text-base font-bold text-slate-100">Personal cargado</h3>
        <p className="mt-1 text-sm text-slate-300/80">
          Administra el listado del personal y carga nuevos eventos desde esa seccion.
        </p>

        <div className="mt-3">
          <Link
            href="/anual/personal-cargado"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-sky-300/35 bg-sky-400/22 px-4 text-sm font-semibold text-sky-100 shadow-sm transition duration-300 ease-out hover:bg-sky-400/30"
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Abrir personal cargado</span>
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-white/15 bg-white/8 p-4 shadow-[0_10px_24px_rgba(2,8,23,0.28)] backdrop-blur-sm">
        <h3 className="text-base font-bold text-slate-100">E-Mails</h3>
        <p className="mt-1 text-sm text-slate-300/80">
          Gestiona destinatarios y revisa el panel de notificaciones.
        </p>

        <div className="mt-3">
          <Link
            href="/anual/email"
            aria-label="E-Mails"
            title="E-Mails"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-sky-300/35 bg-sky-400/22 px-4 text-sm font-semibold text-sky-100 shadow-sm transition duration-300 ease-out hover:bg-sky-400/30"
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
              <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
              <path d="m4.5 7 7.5 5.5L19.5 7" />
            </svg>
            <span>E-Mails</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
