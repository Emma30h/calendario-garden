"use client";

import { useEffect, useMemo, useState } from "react";

function buildClientAccessUrl(origin: string) {
  return `${origin}/acceso-cliente`;
}

export default function ClientAccessLinkManager() {
  const [isDownloadingQr, setIsDownloadingQr] = useState(false);
  const [isQrLoading, setIsQrLoading] = useState(true);
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopyToastVisible, setIsCopyToastVisible] = useState(false);
  const [copyToastCycle, setCopyToastCycle] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setAccessUrl(buildClientAccessUrl(window.location.origin));
  }, []);

  const qrUrl = useMemo(() => {
    if (!accessUrl) {
      return null;
    }

    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(
      accessUrl
    )}`;
  }, [accessUrl]);

  useEffect(() => {
    setIsQrLoading(Boolean(qrUrl));
  }, [qrUrl]);

  useEffect(() => {
    if (!isCopyToastVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsCopyToastVisible(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCopyToastVisible, copyToastCycle]);

  async function handleCopyLink() {
    if (!accessUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(accessUrl);
      setIsCopyToastVisible(true);
      setCopyToastCycle((current) => current + 1);
      setError(null);
    } catch {
      setError("No se pudo copiar el link.");
    }
  }

  function downloadFromUrl(url: string, fileName: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleDownloadQr() {
    if (!qrUrl) {
      return;
    }

    const fileName = `acceso-cliente-qr-${new Date()
      .toISOString()
      .slice(0, 10)}.png`;

    setIsDownloadingQr(true);
    setError(null);

    try {
      const response = await fetch(qrUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudo descargar el QR.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      downloadFromUrl(objectUrl, fileName);
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch {
      downloadFromUrl(qrUrl, fileName);
    } finally {
      setIsDownloadingQr(false);
    }
  }

  return (
    <>
      {isCopyToastVisible ? (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[220] -translate-x-1/2 rounded-full border border-emerald-300/35 bg-emerald-400/15 px-5 py-2 text-sm font-semibold text-emerald-100 shadow-lg shadow-black/25 backdrop-blur">
          link copiado
        </div>
      ) : null}

      <section className="relative z-10 overflow-hidden rounded-2xl border border-white/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-4 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-indigo-300/10 blur-3xl"
        />

        <h2 className="relative z-10 text-lg font-bold text-slate-100">Acceso cliente por link o QR</h2>
        <p className="relative z-10 mt-1 text-sm text-slate-300/90">
          Este es el link fijo de acceso cliente. Abre el calendario anual.
        </p>

        <div className="relative z-10 mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void handleCopyLink();
            }}
            disabled={!accessUrl}
            className="inline-flex rounded-full border border-sky-300/35 bg-sky-400/25 px-5 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/32 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Copiar link
          </button>
        </div>

        {accessUrl ? (
          <div className="relative z-10 mt-4 rounded-xl border border-white/16 bg-slate-900/62 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400/85">
              Link de acceso compartido
            </p>
            <p className="mt-2 break-all text-sm text-slate-100/90">{accessUrl}</p>
          </div>
        ) : null}

        {qrUrl ? (
          <div className="relative z-10 mt-4 w-full max-w-[340px] rounded-xl border border-white/16 bg-slate-900/62 p-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-white/16 bg-slate-950/60">
              {isQrLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-sky-300"
                    aria-label="Cargando QR"
                  />
                </div>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="QR de acceso cliente"
                onLoad={() => {
                  setIsQrLoading(false);
                }}
                onError={() => {
                  setIsQrLoading(false);
                }}
                className={`h-full w-full rounded-lg object-contain transition-opacity duration-200 ${
                  isQrLoading ? "opacity-0" : "opacity-100"
                }`}
              />
            </div>
            <p className="mt-2 text-xs text-slate-300/75">
              QR fijo asociado al link de acceso cliente.
            </p>
            <button
              type="button"
              onClick={() => {
                void handleDownloadQr();
              }}
              disabled={isDownloadingQr}
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDownloadingQr ? "Descargando..." : "Descargar QR (imagen)"}
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="relative z-10 mt-4 rounded-xl border border-red-300/35 bg-red-400/15 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
      </section>
    </>
  );
}
