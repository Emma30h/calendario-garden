"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";

type BirthdayPersonalInfo =
  | {
      category: "Policial";
      policial?: "Oficial" | "Suboficial" | "Tecnico" | "Civil";
      oficialCategory?: string;
      suboficialCategory?: string;
    }
  | { category: "Civil" | "Gobierno" };

type BirthdayRecord = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  personal: BirthdayPersonalInfo;
};

type CardBackgroundStyleId = "fondo1" | "fondo2" | "fondo3" | "fondo4" | "fondo5";

type CardBackgroundStyle = {
  id: CardBackgroundStyleId;
  label: string;
  imageSrc: string;
};

type CardFontColorId = "oscuro" | "blanco" | "azul" | "dorado";

type CardFontColorOption = {
  id: CardFontColorId;
  label: string;
  color: string;
};

type CardBackgroundOverlayId = "none" | "dark" | "light";

type CardBackgroundOverlayOption = {
  id: CardBackgroundOverlayId;
  label: string;
};

type BirthdaysResponse = {
  data?: BirthdayRecord[];
  error?: string;
};

type ToastTone = "success" | "error" | "info";

type ToastState = {
  message: string;
  tone: ToastTone;
} | null;

const ORG_LABEL = "DIRECCION MONITOREO CORDOBESES EN ALERTA";
const MESSAGE_LINES = [
  "Mis más sinceras felicitaciones en",
  "este día tan especial.",
  "Te deseo salud, prosperidad y el",
  "mayor de los éxitos en este nuevo",
  "año.",
];
const SCRIPT_FONT =
  "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive";
const EYE_LOGO_SRC = "/logo-ojos-en-alerta-blanco.png";
const POLICE_LOGO_SRC = "/logo-policia-cordoba.png";
const CARD_CANVAS_WIDTH = 1240;
const CARD_CANVAS_HEIGHT = 1754;
const CARD_BACKGROUND_STYLES: CardBackgroundStyle[] = [
  {
    id: "fondo1",
    label: "Fondo 1",
    imageSrc: "/Salutaci%C3%B3n%20(1).png",
  },
  {
    id: "fondo2",
    label: "Fondo 2",
    imageSrc: "/Salutaci%C3%B3n%20(2).png",
  },
  {
    id: "fondo3",
    label: "Fondo 3",
    imageSrc: "/Salutaci%C3%B3n%20(3).png",
  },
  {
    id: "fondo4",
    label: "Fondo 4",
    imageSrc: "/Salutaci%C3%B3n%20(4).png",
  },
  {
    id: "fondo5",
    label: "Fondo 5",
    imageSrc: "/Salutaci%C3%B3n%20(5).png",
  },
];
const CARD_FONT_COLORS: CardFontColorOption[] = [
  {
    id: "oscuro",
    label: "Oscuro",
    color: "#171717",
  },
  {
    id: "blanco",
    label: "Blanco",
    color: "#f7f7f7",
  },
  {
    id: "azul",
    label: "Azul",
    color: "#163f67",
  },
  {
    id: "dorado",
    label: "Dorado",
    color: "#6b4b12",
  },
];
const CARD_BACKGROUND_OVERLAY_OPTIONS: CardBackgroundOverlayOption[] = [
  {
    id: "none",
    label: "Sin capa",
  },
  {
    id: "dark",
    label: "Capa oscura",
  },
  {
    id: "light",
    label: "Capa clara",
  },
];
const DEFAULT_OVERLAY_OPACITY: Record<Exclude<CardBackgroundOverlayId, "none">, number> = {
  dark: 34,
  light: 24,
};

type CardCanvasAssets = {
  eyeLogo: HTMLImageElement | null;
  policeLogo: HTMLImageElement | null;
  backgrounds: Record<CardBackgroundStyleId, HTMLImageElement | null>;
};

function formatRoleLabel(record: BirthdayRecord) {
  if (record.personal.category !== "Policial") {
    return null;
  }

  const { policial, oficialCategory, suboficialCategory } = record.personal;
  if (!policial) {
    return null;
  }

  if (policial === "Oficial" && oficialCategory) {
    return oficialCategory;
  }

  if (policial === "Suboficial" && suboficialCategory) {
    return suboficialCategory;
  }

  if (policial === "Tecnico" && suboficialCategory) {
    return `${suboficialCategory} Técnico`;
  }

  if (policial === "Tecnico") {
    return "Técnico";
  }

  return policial;
}

function buildRecipientLabel(record: BirthdayRecord) {
  const fullName = `${record.lastName} ${record.firstName}`
    .replace(/\s+/g, " ")
    .trim();

  const roleLabel = formatRoleLabel(record);
  if (roleLabel) {
    return `${roleLabel} ${fullName}`.trim();
  }

  if (record.personal.category === "Civil") {
    return `Personal Civil ${fullName}`.trim();
  }

  if (record.personal.category === "Gobierno") {
    return `Personal de Gobierno ${fullName}`.trim();
  }

  return fullName;
}

function formatDayMonthLabel(isoDate: string) {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "--/--";
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

function buildDayRouteFromIsoDate(isoDate: string) {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return `/mes/${month}/dia/${day}`;
}

function isDailyRoute(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  return path.startsWith("/mes/") || path.startsWith("/dia/");
}

const GENERIC_BIRTHDAY_ID = "__evento__";

function parsePositiveInt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function buildIsoDateFromParts(month: number, day: number, year: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 9999) {
    return null;
  }

  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractRecipientFromEventTitle(eventTitle: string) {
  const normalized = eventTitle.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const withoutPrefix = normalized
    .replace(/^CUMPLEA(?:Ñ|Ã‘|N)OS\s+DE\s+/i, "")
    .replace(/^CUMPLEA(?:Ñ|Ã‘|N)OS\s+/i, "")
    .trim();
  const withoutArea = withoutPrefix.split(" - ")[0]?.trim() ?? "";

  const leadingPatterns = [
    /^(?:DEL|DE\s+LA|DE\s+LAS|DE\s+LOS|AL)\s+/i,
    /^(?:LA|EL|LAS|LOS)\s+/i,
  ];

  let cleaned = withoutArea || withoutPrefix || normalized;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of leadingPatterns) {
      const next = cleaned.replace(pattern, "").trim();
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
  }

  return cleaned || withoutArea || withoutPrefix || normalized;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitScriptText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number
) {
  let fontSize = startSize;
  while (fontSize > 70) {
    ctx.font = `700 ${fontSize}px ${SCRIPT_FONT}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 4;
  }
  return fontSize;
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

async function loadCardAssets(): Promise<CardCanvasAssets> {
  const [eyeLogo, policeLogo, ...backgroundImages] = await Promise.all([
    loadCanvasImage(EYE_LOGO_SRC),
    loadCanvasImage(POLICE_LOGO_SRC),
    ...CARD_BACKGROUND_STYLES.map((style) => loadCanvasImage(style.imageSrc)),
  ]);

  const backgrounds = CARD_BACKGROUND_STYLES.reduce<
    Record<CardBackgroundStyleId, HTMLImageElement | null>
  >((acc, style, index) => {
    acc[style.id] = backgroundImages[index] ?? null;
    return acc;
  }, {} as Record<CardBackgroundStyleId, HTMLImageElement | null>);

  return {
    eyeLogo,
    policeLogo,
    backgrounds,
  };
}

function drawGreetingCard(
  ctx: CanvasRenderingContext2D,
  {
    eventDateLabel,
    recipientLabel,
    signatureLabel,
    eyeLogo,
    policeLogo,
    backgroundImage,
    backgroundOverlay,
    backgroundOverlayOpacity,
    textColor,
    useDarkTitleBadge,
  }: {
    eventDateLabel: string;
    recipientLabel: string;
    signatureLabel: string;
    eyeLogo: HTMLImageElement | null;
    policeLogo: HTMLImageElement | null;
    backgroundImage: HTMLImageElement | null;
    backgroundOverlay: CardBackgroundOverlayId;
    backgroundOverlayOpacity: number;
    textColor: string;
    useDarkTitleBadge: boolean;
  }
) {
  const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
  const pageX = 42;
  const pageY = 42;
  const pageWidth = canvasWidth - pageX * 2;
  const pageHeight = canvasHeight - pageY * 2;
  const centerX = canvasWidth / 2;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "#dde1e7";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  drawRoundedRect(ctx, pageX, pageY, pageWidth, pageHeight, 46);
  ctx.clip();
  if (backgroundImage) {
    drawImageCover(ctx, backgroundImage, pageX, pageY, pageWidth, pageHeight);
  } else {
    ctx.fillStyle = "#eceef1";
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight);
  }
  if (backgroundOverlay === "dark") {
    ctx.fillStyle = `rgba(0,0,0,${backgroundOverlayOpacity})`;
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight);
  } else if (backgroundOverlay === "light") {
    ctx.fillStyle = `rgba(255,255,255,${backgroundOverlayOpacity})`;
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight);
  }
  ctx.restore();

  drawRoundedRect(ctx, pageX, pageY, pageWidth, pageHeight, 46);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.stroke();

  if (eyeLogo) {
    const logoWidth = 220;
    const logoHeight = 154;
    ctx.drawImage(eyeLogo, centerX - logoWidth / 2, pageY + 26, logoWidth, logoHeight);
  }

  const orgLabelY = pageY + 206;
  ctx.textAlign = "center";
  ctx.font = "700 36px 'Trebuchet MS', Arial, sans-serif";
  const orgLabelWidth = ctx.measureText(ORG_LABEL).width;
  const orgBadgeWidth = orgLabelWidth + 84;
  const orgBadgeHeight = 64;
  const orgBadgeX = centerX - orgBadgeWidth / 2;
  const orgBadgeY = orgLabelY - 46;

  const badgeBlurColor = useDarkTitleBadge ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.45)";
  const badgeFillColor = useDarkTitleBadge ? "rgba(0,0,0,0.36)" : "rgba(255,255,255,0.28)";
  const badgeStrokeColor = useDarkTitleBadge ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.5)";

  ctx.save();
  ctx.filter = "blur(10px)";
  ctx.fillStyle = badgeBlurColor;
  drawRoundedRect(ctx, orgBadgeX, orgBadgeY, orgBadgeWidth, orgBadgeHeight, 24);
  ctx.fill();
  ctx.restore();

  drawRoundedRect(ctx, orgBadgeX, orgBadgeY, orgBadgeWidth, orgBadgeHeight, 24);
  ctx.fillStyle = badgeFillColor;
  ctx.fill();
  ctx.strokeStyle = badgeStrokeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.fillText(ORG_LABEL, centerX, orgLabelY);

  ctx.font = "italic 84px Georgia, 'Times New Roman', serif";
  ctx.fillText(eventDateLabel, centerX, pageY + 404);

  const happyFontSize = fitScriptText(ctx, "Feliz", pageWidth - 310, 112);
  ctx.font = `700 ${happyFontSize}px ${SCRIPT_FONT}`;
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 4;
  ctx.fillText("Feliz", centerX, pageY + 612);

  const birthdayFontSize = fitScriptText(ctx, "Cumpleaños!!!", pageWidth - 135, 146);
  ctx.font = `700 ${birthdayFontSize}px ${SCRIPT_FONT}`;
  ctx.fillText("Cumpleaños!!!", centerX, pageY + 760);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (eyeLogo) {
    const watermarkWidth = 595;
    const watermarkHeight = 410;
    ctx.save();
    ctx.globalAlpha = 0.11;
    ctx.drawImage(
      eyeLogo,
      centerX - watermarkWidth / 2,
      pageY + 780,
      watermarkWidth,
      watermarkHeight
    );
    ctx.restore();
  }

  ctx.fillStyle = textColor;
  ctx.font = "600 46px 'Times New Roman', Georgia, serif";
  const nameLines = wrapCanvasText(
    ctx,
    recipientLabel.toLocaleUpperCase("es-AR"),
    pageWidth - 210
  ).slice(0, 2);
  nameLines.forEach((line, index) => {
    ctx.fillText(line, centerX, pageY + 935 + index * 56);
  });

  ctx.font = "500 48px 'Trebuchet MS', Arial, sans-serif";
  MESSAGE_LINES.forEach((line, index) => {
    ctx.fillText(line, centerX, pageY + 1082 + index * 64);
  });

  ctx.font = "700 44px 'Trebuchet MS', Arial, sans-serif";
  ctx.fillText(signatureLabel, centerX, pageY + 1458);

  if (policeLogo) {
    const sealSize = 118;
    ctx.drawImage(
      policeLogo,
      centerX - sealSize / 2,
      pageY + pageHeight - 170,
      sealSize,
      sealSize
    );
  }
}

export default function SalutationPage() {
  const params = useParams<{ id: string | string[] }>();
  const searchParams = useSearchParams();
  const birthdayId = useMemo(() => {
    const raw = params?.id;
    if (Array.isArray(raw)) {
      return raw[0] ?? "";
    }
    return raw ?? "";
  }, [params]);

  const [birthday, setBirthday] = useState<BirthdayRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromName, setFromName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [isRecipientNameEdited, setIsRecipientNameEdited] = useState(false);
  const [isRecipientEditingEnabled, setIsRecipientEditingEnabled] = useState(false);
  const [cardAssets, setCardAssets] = useState<CardCanvasAssets | null>(null);
  const [cardBackgroundStyleId, setCardBackgroundStyleId] =
    useState<CardBackgroundStyleId>("fondo1");
  const [cardBackgroundOverlayId, setCardBackgroundOverlayId] =
    useState<CardBackgroundOverlayId>("none");
  const [overlayOpacities, setOverlayOpacities] = useState(DEFAULT_OVERLAY_OPACITY);
  const [cardFontColorId, setCardFontColorId] = useState<CardFontColorId>("oscuro");
  const [customBackgroundImage, setCustomBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [customBackgroundPreviewUrl, setCustomBackgroundPreviewUrl] = useState<string | null>(null);
  const [isCustomBackgroundSelected, setIsCustomBackgroundSelected] = useState(false);
  const [isCustomBackgroundLoading, setIsCustomBackgroundLoading] = useState(false);
  const [isOverlayMenuOpen, setIsOverlayMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState<"png" | "jpg" | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const customBackgroundInputRef = useRef<HTMLInputElement | null>(null);
  const overlayMenuRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const fallbackEventTitle = useMemo(
    () => searchParams.get("eventTitle") ?? "",
    [searchParams]
  );
  const fallbackRecipientLabel = useMemo(
    () => extractRecipientFromEventTitle(fallbackEventTitle),
    [fallbackEventTitle]
  );
  const fallbackBirthDateIso = useMemo(() => {
    const month = parsePositiveInt(searchParams.get("eventMonth"));
    const day = parsePositiveInt(searchParams.get("eventDay"));
    if (!month || !day) {
      return null;
    }

    const year = parsePositiveInt(searchParams.get("eventYear")) ?? new Date().getFullYear();
    return buildIsoDateFromParts(month, day, year);
  }, [searchParams]);
  const hasFallbackGreetingData = Boolean(fallbackRecipientLabel) || Boolean(fallbackBirthDateIso);

  const baseRecipientLabel = useMemo(
    () => (birthday ? buildRecipientLabel(birthday) : fallbackRecipientLabel || "Cumpleañero"),
    [birthday, fallbackRecipientLabel]
  );
  const recipientLabel = useMemo(
    () => recipientName.trim() || baseRecipientLabel || "Cumpleañero",
    [baseRecipientLabel, recipientName]
  );
  const eventDateLabel = useMemo(
    () =>
      birthday
        ? formatDayMonthLabel(birthday.birthDate)
        : fallbackBirthDateIso
          ? formatDayMonthLabel(fallbackBirthDateIso)
          : "--/--",
    [birthday, fallbackBirthDateIso]
  );
  const signatureLabel = useMemo(
    () => (fromName.trim() || "________________________").toLocaleUpperCase("es-AR"),
    [fromName]
  );
  const selectedBackgroundStyle = useMemo(
    () =>
      CARD_BACKGROUND_STYLES.find((style) => style.id === cardBackgroundStyleId) ??
      CARD_BACKGROUND_STYLES[0],
    [cardBackgroundStyleId]
  );
  const selectedFontColor = useMemo(
    () => CARD_FONT_COLORS.find((option) => option.id === cardFontColorId) ?? CARD_FONT_COLORS[0],
    [cardFontColorId]
  );
  const selectedBackgroundOverlay = useMemo(
    () =>
      CARD_BACKGROUND_OVERLAY_OPTIONS.find((option) => option.id === cardBackgroundOverlayId) ??
      CARD_BACKGROUND_OVERLAY_OPTIONS[0],
    [cardBackgroundOverlayId]
  );
  const activeOverlayKey = useMemo(
    () =>
      selectedBackgroundOverlay.id === "dark" || selectedBackgroundOverlay.id === "light"
        ? selectedBackgroundOverlay.id
        : null,
    [selectedBackgroundOverlay.id]
  );
  const selectedOverlayOpacityPercent = activeOverlayKey ? overlayOpacities[activeOverlayKey] : 0;
  const selectedOverlayOpacity = selectedOverlayOpacityPercent / 100;
  const selectedBackgroundImage = useMemo(() => {
    if (isCustomBackgroundSelected && customBackgroundImage) {
      return customBackgroundImage;
    }

    return cardAssets?.backgrounds[selectedBackgroundStyle.id] ?? null;
  }, [cardAssets, customBackgroundImage, isCustomBackgroundSelected, selectedBackgroundStyle.id]);
  const fallbackDailyHref = useMemo(() => {
    const birthdayDate = birthday?.birthDate ?? fallbackBirthDateIso;
    const fromBirthday = birthdayDate ? buildDayRouteFromIsoDate(birthdayDate) : null;
    if (fromBirthday) {
      return fromBirthday;
    }

    const now = new Date();
    return `/mes/${now.getMonth() + 1}/dia/${now.getDate()}`;
  }, [birthday?.birthDate, fallbackBirthDateIso]);
  const backHref = useMemo(() => {
    const from = searchParams.get("from");
    if (from && isDailyRoute(from)) {
      return from;
    }

    return fallbackDailyHref;
  }, [fallbackDailyHref, searchParams]);
  const backSectionLabel = useMemo(
    () => (backHref.startsWith("/mes/") ? "Vista diaria" : "Calendario anual"),
    [backHref]
  );

  const showToast = (message: string, tone: ToastTone) => {
    setToast({ message, tone });
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2800);
  };

  const handleOverlayOpacityChange = (rawValue: number) => {
    if (!activeOverlayKey || Number.isNaN(rawValue)) {
      return;
    }

    const normalizedValue = Math.max(0, Math.min(100, Math.round(rawValue)));
    setOverlayOpacities((previous) => ({
      ...previous,
      [activeOverlayKey]: normalizedValue,
    }));
  };

  useEffect(() => {
    let isMounted = true;

    const loadAssets = async () => {
      const assets = await loadCardAssets();
      if (isMounted) {
        setCardAssets(assets);
      }
    };

    void loadAssets();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsRecipientNameEdited(false);
    setIsRecipientEditingEnabled(false);
  }, [birthdayId]);

  useEffect(() => {
    if (!isRecipientEditingEnabled) {
      return;
    }

    recipientInputRef.current?.focus();
  }, [isRecipientEditingEnabled]);

  useEffect(() => {
    if (isRecipientNameEdited) {
      return;
    }

    setRecipientName(baseRecipientLabel);
  }, [baseRecipientLabel, isRecipientNameEdited]);

  useEffect(() => {
    return () => {
      if (customBackgroundPreviewUrl) {
        URL.revokeObjectURL(customBackgroundPreviewUrl);
      }
    };
  }, [customBackgroundPreviewUrl]);

  useEffect(() => {
    if (!isOverlayMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (overlayMenuRef.current?.contains(target)) {
        return;
      }

      setIsOverlayMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOverlayMenuOpen]);

  const clearCustomBackground = () => {
    setCustomBackgroundImage(null);
    setCustomBackgroundPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return null;
    });
    setIsCustomBackgroundSelected(false);
    setIsCustomBackgroundLoading(false);
  };

  const handleCustomBackgroundUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file || !file.type.startsWith("image/")) {
      return;
    }

    setIsCustomBackgroundLoading(true);
    const objectUrl = URL.createObjectURL(file);

    try {
      const loadedImage = await loadCanvasImage(objectUrl);
      if (!loadedImage) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      setCustomBackgroundImage(loadedImage);
      setCustomBackgroundPreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        return objectUrl;
      });
      setIsCustomBackgroundSelected(true);
    } finally {
      setIsCustomBackgroundLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadBirthday = async () => {
      if (!birthdayId) {
        if (isMounted) {
          setError("No se pudo identificar el cumpleaños seleccionado.");
          setIsLoading(false);
        }
        return;
      }

      if (birthdayId === GENERIC_BIRTHDAY_ID) {
        if (isMounted) {
          setBirthday(null);
          setError(
            hasFallbackGreetingData
              ? null
              : "No se pudo identificar el cumpleaños seleccionado."
          );
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/birthdays?id=${encodeURIComponent(birthdayId)}`,
          {
            cache: "no-store",
          }
        );
        const payload = (await response.json()) as BirthdaysResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "No se pudo cargar el cumpleaños.");
        }

        const found = Array.isArray(payload.data) ? payload.data[0] ?? null : null;
        if (!found) {
          throw new Error("No se encontró el cumpleaños solicitado.");
        }

        if (!isMounted) {
          return;
        }

        setBirthday(found);
      } catch (caught) {
        if (!isMounted) {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Error inesperado al cargar la tarjeta."
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadBirthday();

    return () => {
      isMounted = false;
    };
  }, [birthdayId, hasFallbackGreetingData]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    drawGreetingCard(ctx, {
      eventDateLabel,
      recipientLabel,
      signatureLabel,
      eyeLogo: cardAssets?.eyeLogo ?? null,
      policeLogo: cardAssets?.policeLogo ?? null,
      backgroundImage: selectedBackgroundImage,
      backgroundOverlay: selectedBackgroundOverlay.id,
      backgroundOverlayOpacity: selectedOverlayOpacity,
      textColor: selectedFontColor.color,
      useDarkTitleBadge: selectedFontColor.id === "blanco",
    });
  }, [
    cardAssets,
    eventDateLabel,
    recipientLabel,
    selectedBackgroundImage,
    selectedBackgroundOverlay.id,
    selectedOverlayOpacity,
    selectedFontColor.color,
    selectedFontColor.id,
    signatureLabel,
  ]);

  const downloadImage = async (format: "png" | "jpg") => {
    if (isLoading || Boolean(error)) {
      showToast("No se pudo descargar la imagen.", "error");
      return;
    }

    setIsDownloading(format);
    showToast(`Descarga iniciada (${format.toUpperCase()})...`, "info");

    try {
      let assets = cardAssets;
      if (!assets) {
        assets = await loadCardAssets();
        setCardAssets(assets);
      }

      const canvas = document.createElement("canvas");
      canvas.width = CARD_CANVAS_WIDTH;
      canvas.height = CARD_CANVAS_HEIGHT;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("No se pudo crear la imagen.");
      }

      if (format === "jpg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const downloadBackgroundImage =
        isCustomBackgroundSelected && customBackgroundImage
          ? customBackgroundImage
          : assets.backgrounds[selectedBackgroundStyle.id] ?? null;

      drawGreetingCard(ctx, {
        eventDateLabel,
        recipientLabel,
        signatureLabel,
        eyeLogo: assets.eyeLogo,
        policeLogo: assets.policeLogo,
        backgroundImage: downloadBackgroundImage,
        backgroundOverlay: selectedBackgroundOverlay.id,
        backgroundOverlayOpacity: selectedOverlayOpacity,
        textColor: selectedFontColor.color,
        useDarkTitleBadge: selectedFontColor.id === "blanco",
      });

      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const extension = format === "png" ? "png" : "jpg";
      const dataUrl = canvas.toDataURL(mimeType, 0.95);
      const a = document.createElement("a");
      const nameSlug = sanitizeFileName(recipientLabel) || "cumpleanero";
      a.href = dataUrl;
      a.download = `salutacion-${nameSlug}.${extension}`;
      a.click();
      showToast(`Descarga completada (${format.toUpperCase()}).`, "success");
    } catch (caught) {
      showToast(
        caught instanceof Error
          ? caught.message
          : "No se pudo descargar la imagen.",
        "error"
      );
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <main className="min-h-dvh bg-transparent px-4 py-6 sm:px-6 lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:px-8 lg:py-3">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 lg:h-full lg:min-h-0 lg:gap-4">
        <div className="relative overflow-hidden rounded-3xl border border-white/25 bg-[linear-gradient(140deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] px-4 py-3 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:px-6 sm:py-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-indigo-300/10 blur-3xl"
          />

          <SectionBreadcrumb
            items={[
              { label: backSectionLabel, href: backHref },
              { label: "Tarjeta" },
            ]}
            className="relative text-slate-400/90 [&_a]:text-sky-300 [&_a:hover]:text-sky-200 [&_span]:text-slate-400/90"
          />
          <h1 className="relative text-xl font-extrabold tracking-tight text-slate-100 sm:text-2xl">
            Vista previa de tarjeta
          </h1>
        </div>

        <article className="relative overflow-hidden rounded-[1.75rem] border border-white/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.66)_0%,rgba(15,23,42,0.42)_100%)] p-4 shadow-[0_24px_52px_rgba(2,8,23,0.45)] backdrop-blur-md sm:p-6 lg:flex-1 lg:min-h-0 lg:p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-300/18 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -bottom-24 h-52 w-52 rounded-full bg-indigo-300/10 blur-3xl"
          />
          {isLoading ? (
            <div
              aria-hidden
              className="relative z-10 space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)] lg:gap-4 lg:space-y-0"
            >
              <div className="lg:flex lg:min-h-0 lg:items-center lg:justify-center">
                <div className="relative mx-auto aspect-[210/297] w-full max-w-[735px] overflow-hidden rounded-[1rem] border border-white/25 bg-slate-900/35 shadow-[0_24px_42px_rgba(2,8,23,0.35)] backdrop-blur-sm lg:h-full lg:max-h-full lg:w-auto lg:max-w-none">
                  <div className="auth-skeleton absolute inset-0 rounded-[1rem]" />
                </div>
              </div>
              <div className="space-y-4 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm lg:flex lg:min-h-0 lg:flex-col lg:space-y-3 lg:overflow-y-auto lg:p-3 lg:pr-2">
                <div className="space-y-2">
                  <div className="auth-skeleton h-4 w-28 rounded" />
                  <div className="grid grid-cols-3 gap-2">
                    {CARD_BACKGROUND_STYLES.map((style) => (
                      <div
                        key={style.id}
                        className="auth-skeleton aspect-[210/297] rounded-[0.72rem]"
                      />
                    ))}
                    <div className="auth-skeleton aspect-[210/297] rounded-[0.72rem]" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="auth-skeleton h-4 w-20 rounded" />
                  <div className="auth-skeleton h-10 w-full rounded-xl" />
                </div>
                <div className="space-y-2">
                  <div className="auth-skeleton h-4 w-24 rounded" />
                  <div className="grid grid-cols-2 gap-2">
                    {CARD_FONT_COLORS.map((option) => (
                      <div
                        key={option.id}
                        className="auth-skeleton h-10 rounded-xl"
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:flex-col">
                  <div className="auth-skeleton h-10 w-36 rounded-full" />
                  <div className="auth-skeleton h-10 w-36 rounded-full" />
                </div>
              </div>
            </div>
          ) : error ? (
            <p className="relative z-10 rounded-xl border border-red-300/30 bg-red-400/15 px-3 py-2 text-sm font-semibold text-red-100">
              {error}
            </p>
          ) : (
            <div className="relative z-10 space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,20rem)] lg:gap-4 lg:space-y-0">
              <div className="lg:flex lg:min-h-0 lg:items-center lg:justify-center">
                <div className="relative mx-auto aspect-[210/297] w-full max-w-[735px] overflow-hidden rounded-[1rem] border border-white/20 bg-[#e8edf6] shadow-[0_24px_42px_rgba(2,8,23,0.28)] lg:h-full lg:max-h-full lg:w-auto lg:max-w-none">
                  <div className="absolute left-3 top-3 z-20">
                    <div ref={overlayMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setIsOverlayMenuOpen((open) => !open)}
                        aria-label="Opciones de capa para resaltar texto"
                        aria-expanded={isOverlayMenuOpen}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/55 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-sm shadow-black/30 backdrop-blur transition hover:bg-slate-800/65"
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M12 3L3 7.5 12 12l9-4.5L12 3Z" />
                          <path d="M3 12.5 12 17l9-4.5" />
                          <path d="M3 17.5 12 22l9-4.5" />
                        </svg>
                        {selectedBackgroundOverlay.label}
                      </button>
                      {isOverlayMenuOpen ? (
                        <div className="absolute left-0 top-full mt-2 w-40 rounded-xl border border-white/20 bg-slate-950/90 p-1.5 shadow-lg shadow-black/45 backdrop-blur-md">
                          {CARD_BACKGROUND_OVERLAY_OPTIONS.map((option) => {
                            const isSelected = option.id === selectedBackgroundOverlay.id;

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setCardBackgroundOverlayId(option.id);
                                  setIsOverlayMenuOpen(false);
                                }}
                                className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition ${
                                  isSelected
                                    ? "bg-sky-300/20 text-sky-100"
                                    : "text-slate-200 hover:bg-white/10"
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <canvas
                    ref={previewCanvasRef}
                    width={CARD_CANVAS_WIDTH}
                    height={CARD_CANVAS_HEIGHT}
                    className="h-full w-full"
                    aria-label="Vista previa de tarjeta de cumpleaños"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm lg:flex lg:min-h-0 lg:flex-col lg:space-y-3 lg:overflow-y-auto lg:p-3 lg:pr-2">
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-100/95">Fondo de tarjeta</span>
                  <input
                    ref={customBackgroundInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCustomBackgroundUpload}
                    className="hidden"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {CARD_BACKGROUND_STYLES.map((style) => {
                      const isSelected = style.id === cardBackgroundStyleId;

                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => {
                            setCardBackgroundStyleId(style.id);
                            setIsCustomBackgroundSelected(false);
                          }}
                          aria-label={`Seleccionar fondo ${style.label}`}
                          aria-pressed={isSelected && !isCustomBackgroundSelected}
                          className={`group relative aspect-[210/297] overflow-hidden rounded-[0.72rem] border transition ${
                            isSelected && !isCustomBackgroundSelected
                              ? "border-sky-300 ring-2 ring-sky-300/35"
                              : "border-white/20 hover:border-white/45"
                          }`}
                        >
                          <Image
                            src={style.imageSrc}
                            alt={style.label}
                            fill
                            sizes="(max-width: 1024px) 20vw, 84px"
                            className="object-cover"
                          />
                          <span className="absolute inset-0 bg-black/10 transition group-hover:bg-black/5" />
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        if (customBackgroundImage && !isCustomBackgroundSelected) {
                          setIsCustomBackgroundSelected(true);
                          return;
                        }
                        customBackgroundInputRef.current?.click();
                      }}
                      aria-label="Agregar fondo personalizado"
                      aria-pressed={Boolean(customBackgroundImage && isCustomBackgroundSelected)}
                      className={`group relative aspect-[210/297] overflow-hidden rounded-[0.72rem] border transition ${
                        customBackgroundImage && isCustomBackgroundSelected
                          ? "border-sky-300 ring-2 ring-sky-300/35"
                          : "border-dashed border-white/30 hover:border-white/50"
                      }`}
                    >
                      {customBackgroundPreviewUrl ? (
                        <>
                          <Image
                            src={customBackgroundPreviewUrl}
                            alt="Fondo personalizado"
                            fill
                            sizes="(max-width: 1024px) 20vw, 84px"
                            className="object-cover"
                            unoptimized
                          />
                          <span className="absolute inset-0 bg-black/20 transition group-hover:bg-black/10" />
                          <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/50 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                            Personalizado
                          </span>
                        </>
                      ) : (
                        <span className="absolute inset-0 grid place-items-center bg-[linear-gradient(160deg,rgba(15,23,42,0.75)_0%,rgba(30,41,59,0.8)_100%)]">
                          <span className="flex flex-col items-center gap-2 text-slate-100">
                            {isCustomBackgroundLoading ? (
                              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/45 border-t-white" />
                            ) : (
                              <svg
                                aria-hidden
                                viewBox="0 0 24 24"
                                className="h-6 w-6"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                              >
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 8v8M8 12h8" />
                              </svg>
                            )}
                            <span className="text-[10px] font-semibold uppercase tracking-wide">
                              Agregar fondo
                            </span>
                          </span>
                        </span>
                      )}
                    </button>
                  </div>
                  {customBackgroundImage ? (
                    <button
                      type="button"
                      onClick={clearCustomBackground}
                      className="inline-flex items-center gap-2 rounded-full border border-red-300/45 bg-red-400/15 px-3 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-400/25"
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M5 5l14 14M19 5L5 19" />
                      </svg>
                      Quitar fondo personalizado
                    </button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-100/95">Color de fuente</span>
                  <div className="grid grid-cols-2 gap-2">
                    {CARD_FONT_COLORS.map((option) => {
                      const isSelected = option.id === cardFontColorId;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setCardFontColorId(option.id)}
                          aria-label={`Seleccionar color ${option.label}`}
                          aria-pressed={isSelected}
                          className={`inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                            isSelected
                              ? "border-sky-300 bg-sky-300/15 ring-2 ring-sky-300/25"
                              : "border-white/20 bg-slate-900/45 hover:border-white/45"
                          }`}
                        >
                          <span
                            className="h-5 w-5 shrink-0 rounded-full border border-white/25"
                            style={{ backgroundColor: option.color }}
                          />
                          <span className="text-xs font-semibold text-slate-100">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-100/95">Opacidad de capa</span>
                  <div className="rounded-xl border border-white/20 bg-slate-900/55 px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-200/85">
                      <span>
                        {activeOverlayKey ? selectedBackgroundOverlay.label : "Sin capa seleccionada"}
                      </span>
                      <span>{activeOverlayKey ? `${selectedOverlayOpacityPercent}%` : "--"}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={activeOverlayKey ? selectedOverlayOpacityPercent : 0}
                      onChange={(event) => {
                        handleOverlayOpacityChange(Number(event.target.value));
                      }}
                      disabled={!activeOverlayKey}
                      className="h-2 w-full cursor-pointer accent-sky-300 disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Ajustar opacidad de la capa seleccionada"
                    />
                  </div>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100/95">Para</span>
                    <button
                      type="button"
                      onClick={() => setIsRecipientEditingEnabled((previous) => !previous)}
                      aria-label={
                        isRecipientEditingEnabled
                          ? "Bloquear edición del destinatario"
                          : "Desbloquear edición del destinatario"
                      }
                      aria-pressed={isRecipientEditingEnabled}
                      className={`inline-flex items-center justify-center rounded-full border p-2 transition ${
                        isRecipientEditingEnabled
                          ? "border-sky-300/45 bg-sky-300/15 text-sky-100 hover:bg-sky-300/25"
                          : "border-white/20 bg-slate-900/45 text-slate-100 hover:bg-white/10"
                      }`}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {isRecipientEditingEnabled ? (
                          <>
                            <rect x="4" y="11" width="16" height="10" rx="2" />
                            <path d="M8 11V8a4 4 0 0 1 7.2-2.4" />
                          </>
                        ) : (
                          <>
                            <rect x="4" y="11" width="16" height="10" rx="2" />
                            <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                          </>
                        )}
                      </svg>
                    </button>
                  </span>
                  <input
                    ref={recipientInputRef}
                    type="text"
                    value={recipientName}
                    onChange={(event) => {
                      setRecipientName(event.target.value);
                      setIsRecipientNameEdited(true);
                    }}
                    disabled={!isRecipientEditingEnabled}
                    placeholder="Ej: Oficial Juan Perez"
                    className={`rounded-xl border px-3 py-2 text-sm outline-none ring-sky-300/35 transition focus:ring-2 disabled:cursor-not-allowed ${
                      isRecipientEditingEnabled
                        ? "border-white/20 bg-slate-900/55 text-slate-100"
                        : "border-white/15 bg-slate-900/35 text-slate-300/70"
                    }`}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-100/95">De parte de</span>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(event) => setFromName(event.target.value)}
                    placeholder="Ej: Crio. Insp. Lic. Oscar Valentin Velez"
                    className="rounded-xl border border-white/20 bg-slate-900/55 px-3 py-2 text-sm text-slate-100 outline-none ring-sky-300/35 transition focus:ring-2"
                  />
                </label>

                <div className="flex flex-wrap gap-2 lg:flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      void downloadImage("png");
                    }}
                    disabled={isDownloading !== null}
                    className={`inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isDownloading === "png" ? "animate-pulse" : ""
                    }`}
                  >
                    {isDownloading === "png" ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/35 border-t-slate-950" />
                        Descargando...
                      </>
                    ) : (
                      "Descargar PNG"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void downloadImage("jpg");
                    }}
                    disabled={isDownloading !== null}
                    className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isDownloading === "jpg" ? "animate-pulse" : ""
                    }`}
                  >
                    {isDownloading === "jpg" ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/45 border-t-white" />
                        Descargando...
                      </>
                    ) : (
                      "Descargar JPG"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </article>
      </section>
      {toast ? (
        <div
          className="pointer-events-none fixed left-1/2 top-4 z-[100] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2"
        >
          <p
            role="status"
            aria-live="polite"
            className={`rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur ${
              toast.tone === "success"
                ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                : toast.tone === "info"
                  ? "border-sky-300/30 bg-sky-400/15 text-sky-100"
                  : "border-red-300/30 bg-red-400/15 text-red-100"
            }`}
            style={{ animation: "toast-slide-down 320ms ease-out" }}
          >
            {toast.message}
          </p>
        </div>
      ) : null}
      <style jsx global>{`
        @keyframes toast-slide-down {
          from {
            opacity: 0;
            transform: translateY(-18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}


