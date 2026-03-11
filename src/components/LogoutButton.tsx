"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
  label?: string;
  pendingLabel?: string;
};

export default function LogoutButton({
  className,
  label = "Cerrar sesion",
  pendingLabel = "Saliendo...",
}: LogoutButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onLogout() {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/auth/login");
      router.refresh();
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={isSubmitting}
      onClick={() => {
        void onLogout();
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
