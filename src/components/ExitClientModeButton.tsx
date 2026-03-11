"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ExitClientModeButtonProps = {
  className?: string;
  label?: string;
  pendingLabel?: string;
};

export default function ExitClientModeButton({
  className,
  label = "Salir modo cliente",
  pendingLabel = "Saliendo...",
}: ExitClientModeButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onExitClientMode() {
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/exit-client-mode", {
        method: "POST",
      });
      if (!response.ok) {
        return;
      }

      router.replace("/anual");
      router.refresh();
    } catch {
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isSubmitting}
      onClick={() => {
        void onExitClientMode();
      }}
      className={
        className ??
        "inline-flex h-11 items-center justify-center rounded-full border border-black/20 bg-white px-4 text-sm font-semibold text-black/70 shadow-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {isSubmitting ? pendingLabel : label}
    </button>
  );
}
