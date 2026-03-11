"use client";

import Link from "next/link";

type SectionBreadcrumbItem = {
  label: string;
  href?: string;
};

type SectionBreadcrumbProps = {
  items: SectionBreadcrumbItem[];
  className?: string;
};

function normalizeLabel(value: string) {
  return value.trim();
}

export default function SectionBreadcrumb({
  items,
  className,
}: SectionBreadcrumbProps) {
  const normalizedItems = items
    .map((item) => ({
      ...item,
      label: normalizeLabel(item.label),
    }))
    .filter((item) => item.label.length > 0);

  if (normalizedItems.length === 0) {
    return null;
  }

  const lastItemIndex = normalizedItems.length - 1;

  return (
    <nav
      aria-label="Ruta de navegacion"
      className={
        className
          ? `flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-black/45 ${className}`
          : "flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-black/45"
      }
    >
      {normalizedItems.map((item, index) => {
        const isLastItem = index === lastItemIndex;

        return (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-2">
            {item.href && !isLastItem ? (
              <Link
                href={item.href}
                className="text-[#2f7d32] transition hover:text-[#245f28] hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
            {!isLastItem ? <span className="text-black/35">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}
