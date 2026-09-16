"use client";

import { Cinzel, Great_Vibes, Playfair_Display } from "next/font/google";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import SectionBreadcrumb from "@/components/SectionBreadcrumb";

// Fuentes reales para las plantillas de tarjeta (dibujadas en <canvas>, no en
// DOM/CSS) — ver drawDoradoTemplate/drawEsmeraldaTemplate mas abajo. Canvas
// necesita que la FontFace ya este cargada antes de dibujar o cae en
// silencio a una fuente de sistema; ver ensureCardFontsLoaded.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});
const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});

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

type CardTemplateId = "dorado" | "esmeralda" | "zafiro" | "rubi";

type CardTemplateOption = {
  id: CardTemplateId;
  label: string;
  description: string;
  swatch: string;
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

type OrgLabelOptionId = "dmca" | "dac";

type OrgLabelOption = {
  id: OrgLabelOptionId;
  label: string;
  value: string;
};

const ORG_LABEL_OPTIONS: OrgLabelOption[] = [
  {
    id: "dmca",
    label: "D.M.C.A.",
    value: "DIRECCION MONITOREO CORDOBESES EN ALERTA",
  },
  {
    id: "dac",
    label: "Dep. Alerta Ciudadana",
    value: "DEPARTAMENTO ALERTA CIUDADANA",
  },
];
const DEFAULT_MESSAGE =
  "Mis más sinceras felicitaciones en este día tan especial. Te deseo salud, prosperidad y el mayor de los éxitos en este nuevo año.";
const EYE_LOGO_SRC = "/logo-ojos-en-alerta-blanco.png";
const POLICE_LOGO_SRC = "/logo-policia-cordoba.png";
const CARD_CANVAS_WIDTH = 1240;
const CARD_CANVAS_HEIGHT = 1754;
const MAX_CUSTOM_BACKGROUND_BYTES = 8 * 1024 * 1024;
const CARD_TEMPLATES: CardTemplateOption[] = [
  {
    id: "dorado",
    label: "Dorado",
    description: "Verde institucional, marco y tipografía art-decó dorada.",
    swatch: "linear-gradient(155deg, #d9bd82 0%, #12281d 42%, #0a1712 100%)",
  },
  {
    id: "esmeralda",
    label: "Esmeralda",
    description: "Teal degradé con caligrafía script dorada.",
    swatch: "linear-gradient(155deg, #e7c65f 0%, #1c5c56 45%, #0a2e2c 100%)",
  },
  {
    id: "zafiro",
    label: "Zafiro",
    description: "Azul institucional, marco y tipografía art-decó en plata.",
    swatch: "linear-gradient(155deg, #e7ecf7 0%, #1c2c4d 42%, #070c18 100%)",
  },
  {
    id: "rubi",
    label: "Rubí",
    description: "Vino profundo con caligrafía script dorada.",
    swatch: "linear-gradient(155deg, #f3ce6b 0%, #6b1530 45%, #210810 100%)",
  },
];

type CardCanvasAssets = {
  eyeLogo: HTMLImageElement | null;
  policeLogo: HTMLImageElement | null;
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
  startSize: number,
  fontFamily: string,
  weight = 400,
  minSize = 70
) {
  let fontSize = startSize;
  while (fontSize > minSize) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 4;
  }
  // Piso alcanzado sin entrar: dejar ctx.font en sync con el tamaño
  // devuelto (si no, queda seteado en el ultimo intento fallido).
  ctx.font = `${weight} ${minSize}px ${fontFamily}`;
  return minSize;
}

// A diferencia de fitScriptText (una sola linea), esto se usa para texto de
// largo variable (rol + nombre completo, editable por el usuario) que puede
// necesitar varias lineas: en vez de fijar un tamaño y despues recortar
// lineas de mas (perdiendo texto real, como el nombre de pila), va
// reduciendo el tamaño hasta que el wrap entra en maxLines.
function fitWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
  weight: number,
  maxLines: number,
  startSize: number,
  minSize: number
) {
  let fontSize = startSize;
  while (fontSize > minSize) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    const lines = wrapCanvasText(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return { fontSize, lines };
    }
    fontSize -= 2;
  }
  ctx.font = `${weight} ${minSize}px ${fontFamily}`;
  return { fontSize: minSize, lines: wrapCanvasText(ctx, text, maxWidth).slice(0, maxLines) };
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

async function loadCardAssets(): Promise<CardCanvasAssets> {
  const [eyeLogo, policeLogo] = await Promise.all([
    loadCanvasImage(EYE_LOGO_SRC),
    loadCanvasImage(POLICE_LOGO_SRC),
  ]);

  return { eyeLogo, policeLogo };
}

// Canvas solo respeta una fuente web si su FontFace ya esta cargada en el
// browser -- si no, ctx.font cae en silencio a una fuente de sistema. Se
// llama antes de cada dibujo (preview y descarga) para las tres fuentes que
// usan las plantillas.
async function ensureCardFontsLoaded() {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return;
  }

  const specs = [
    `700 90px ${cinzel.style.fontFamily}`,
    `900 90px ${cinzel.style.fontFamily}`,
    `400 90px ${greatVibes.style.fontFamily}`,
    `400 48px ${playfairDisplay.style.fontFamily}`,
    `600 48px ${playfairDisplay.style.fontFamily}`,
  ];

  try {
    await Promise.all(specs.map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch {
    // Si falla la carga explicita, se sigue igual: el dibujo cae a la
    // fuente de sistema del stack en vez de romper la descarga.
  }
}

type BackgroundOverlayTone = "oscura" | "clara";

type BackgroundOverlay = {
  tone: BackgroundOverlayTone;
  opacityPercent: number;
};

type GreetingCardData = {
  eventDateLabel: string;
  recipientLabel: string;
  signatureLabel: string;
  orgLabel: string;
  messageText: string;
  eyeLogo: HTMLImageElement | null;
  policeLogo: HTMLImageElement | null;
  customBackground: HTMLImageElement | null;
  backgroundOverlay: BackgroundOverlay;
};

// Dibuja `image` recortada para cubrir todo el rect (x,y,width,height) sin
// deformarla, equivalente a `background-size: cover` en CSS.
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;

  if (imageRatio > targetRatio) {
    drawHeight = height;
    drawWidth = height * imageRatio;
  } else {
    drawWidth = width;
    drawHeight = width / imageRatio;
  }

  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

// Base: foto propia (si hay) o el degradé de la paleta de la plantilla.
// Encima, siempre se puede sumar una capa lisa oscura o clara (tono y
// opacidad elegidos por el usuario) para resaltar o atenuar ese fondo -- con
// foto o sin ella -- y que el texto se siga leyendo bien.
function drawBackgroundLayer(
  ctx: CanvasRenderingContext2D,
  pageX: number,
  pageY: number,
  pageWidth: number,
  pageHeight: number,
  gradientVector: { x0: number; y0: number; x1: number; y1: number },
  bgStops: [string, string, string],
  customBackground: HTMLImageElement | null,
  backgroundOverlay: BackgroundOverlay
) {
  if (customBackground) {
    drawImageCover(ctx, customBackground, pageX, pageY, pageWidth, pageHeight);
  } else {
    const bg = ctx.createLinearGradient(gradientVector.x0, gradientVector.y0, gradientVector.x1, gradientVector.y1);
    bg.addColorStop(0, bgStops[0]);
    bg.addColorStop(0.55, bgStops[1]);
    bg.addColorStop(1, bgStops[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight);
  }

  if (backgroundOverlay.opacityPercent > 0) {
    const overlayRgb = backgroundOverlay.tone === "clara" ? "255,255,255" : "0,0,0";
    const alpha = Math.min(Math.max(backgroundOverlay.opacityPercent, 0), 100) / 100;
    ctx.fillStyle = `rgba(${overlayRgb},${alpha})`;
    ctx.fillRect(pageX, pageY, pageWidth, pageHeight);
  }
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fillStyle: string | CanvasGradient
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

type AccentStops = [string, string, string];

type ArtDecoPalette = {
  base: string;
  bgStops: [string, string, string];
  accentStops: AccentStops;
  accentSolid: string;
  frameInner: string;
  crownStroke: string;
  cream: string;
};

function accentGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: AccentStops
) {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, stops[0]);
  gradient.addColorStop(0.5, stops[1]);
  gradient.addColorStop(1, stops[2]);
  return gradient;
}

// Marco doble con rombos en las 4 esquinas -- motivo art-decó estilizado
// (no una reproducción literal de un marco fotografiado).
function drawArtDecoFrame(
  ctx: CanvasRenderingContext2D,
  pageX: number,
  pageY: number,
  pageWidth: number,
  pageHeight: number,
  palette: ArtDecoPalette
) {
  const outer = { x: pageX + 18, y: pageY + 18, w: pageWidth - 36, h: pageHeight - 36 };
  const inner = { x: pageX + 36, y: pageY + 36, w: pageWidth - 72, h: pageHeight - 72 };

  drawRoundedRect(ctx, outer.x, outer.y, outer.w, outer.h, 34);
  ctx.lineWidth = 3;
  ctx.strokeStyle = accentGradient(ctx, outer.x, outer.y, outer.x + outer.w, outer.y + outer.h, palette.accentStops);
  ctx.stroke();

  drawRoundedRect(ctx, inner.x, inner.y, inner.w, inner.h, 24);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = palette.frameInner;
  ctx.stroke();

  const corners = [
    { x: outer.x, y: outer.y, dx: 1, dy: 1 },
    { x: outer.x + outer.w, y: outer.y, dx: -1, dy: 1 },
    { x: outer.x, y: outer.y + outer.h, dx: 1, dy: -1 },
    { x: outer.x + outer.w, y: outer.y + outer.h, dx: -1, dy: -1 },
  ];
  const fill = accentGradient(ctx, pageX, pageY, pageX + pageWidth, pageY + pageHeight, palette.accentStops);
  for (const corner of corners) {
    drawDiamond(ctx, corner.x, corner.y, 20, fill);
    ctx.strokeStyle = fill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corner.x + corner.dx * 16, corner.y);
    ctx.lineTo(corner.x + corner.dx * 62, corner.y);
    ctx.moveTo(corner.x, corner.y + corner.dy * 16);
    ctx.lineTo(corner.x, corner.y + corner.dy * 62);
    ctx.stroke();
  }
}

// Corona geométrica simplificada: base + 3 picos con perlas encima.
function drawCrown(ctx: CanvasRenderingContext2D, centerX: number, topY: number, palette: ArtDecoPalette) {
  const fill = accentGradient(ctx, centerX - 90, topY, centerX + 90, topY + 75, palette.accentStops);
  const baseY = topY + 75;

  ctx.beginPath();
  ctx.moveTo(centerX - 90, baseY);
  ctx.lineTo(centerX - 68, topY + 20);
  ctx.lineTo(centerX - 34, topY + 52);
  ctx.lineTo(centerX, topY);
  ctx.lineTo(centerX + 34, topY + 52);
  ctx.lineTo(centerX + 68, topY + 20);
  ctx.lineTo(centerX + 90, baseY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = palette.crownStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  drawRoundedRect(ctx, centerX - 96, baseY, 192, 22, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = palette.crownStroke;
  ctx.stroke();

  ctx.fillStyle = fill;
  [
    { x: centerX - 68, y: topY + 20, r: 6 },
    { x: centerX, y: topY, r: 8 },
    { x: centerX + 68, y: topY + 20, r: 6 },
  ].forEach((dot) => {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFleck(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, alpha: number, color: string) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.fillRect(-size / 2, -size / 2, size, size * 0.55);
  ctx.restore();
}

// Bandas curvas translúcidas para dar profundidad al fondo teal, evocando
// las líneas onduladas del diseño de referencia sin reproducirlo al pixel.
function drawSoftRibbon(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  endX: number,
  endY: number,
  lineWidth: number,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
  ctx.stroke();
  ctx.restore();
}

const DORADO_PALETTE: ArtDecoPalette = {
  base: "#050b08",
  bgStops: ["#173225", "#0f2118", "#0a1712"],
  accentStops: ["#f6e6b8", "#d9b969", "#a9781f"],
  accentSolid: "#e9cf8f",
  frameInner: "rgba(244,223,164,0.55)",
  crownStroke: "#7c5716",
  cream: "#f1e6cf",
};

const ZAFIRO_PALETTE: ArtDecoPalette = {
  base: "#04070d",
  bgStops: ["#1c2c4d", "#131f38", "#0a1120"],
  accentStops: ["#f5f7fc", "#c3cee3", "#8793ad"],
  accentSolid: "#d7dfef",
  frameInner: "rgba(211,220,239,0.5)",
  crownStroke: "#3d4a68",
  cream: "#e7ecf7",
};

function drawArtDecoTemplate(ctx: CanvasRenderingContext2D, data: GreetingCardData, palette: ArtDecoPalette) {
  const { eventDateLabel, recipientLabel, signatureLabel, orgLabel, messageText, eyeLogo, customBackground, backgroundOverlay } = data;
  const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
  const pageX = 42;
  const pageY = 42;
  const pageWidth = canvasWidth - pageX * 2;
  const pageHeight = canvasHeight - pageY * 2;
  const centerX = canvasWidth / 2;
  const cin = cinzel.style.fontFamily;
  const playfair = playfairDisplay.style.fontFamily;
  const accent = palette.accentSolid;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  drawRoundedRect(ctx, pageX, pageY, pageWidth, pageHeight, 46);
  ctx.clip();
  drawBackgroundLayer(
    ctx,
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    { x0: 0, y0: pageY, x1: 0, y1: pageY + pageHeight },
    palette.bgStops,
    customBackground,
    backgroundOverlay
  );
  ctx.restore();

  drawArtDecoFrame(ctx, pageX, pageY, pageWidth, pageHeight, palette);

  ctx.textAlign = "center";
  drawDiamond(ctx, centerX, pageY + pageHeight * 0.028, 14, accentGradient(ctx, pageX, pageY, pageX + pageWidth, pageY, palette.accentStops));
  drawCrown(ctx, centerX, pageY + pageHeight * 0.045, palette);

  const titleGradient = accentGradient(ctx, centerX - 260, pageY + pageHeight * 0.15, centerX + 260, pageY + pageHeight * 0.24, palette.accentStops);
  ctx.fillStyle = titleGradient;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  const line1Size = fitScriptText(ctx, "FELIZ", pageWidth - 260, 96, cin, 900);
  ctx.font = `900 ${line1Size}px ${cin}`;
  ctx.fillText("FELIZ", centerX, pageY + pageHeight * 0.185);
  const line2Size = fitScriptText(ctx, "CUMPLEAÑOS", pageWidth - 160, 96, cin, 900);
  ctx.font = `900 ${line2Size}px ${cin}`;
  ctx.fillText("CUMPLEAÑOS", centerX, pageY + pageHeight * 0.235);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = accent;
  ctx.font = `400 52px ${playfair}`;
  ctx.fillText(eventDateLabel, centerX, pageY + pageHeight * 0.29);

  const { fontSize: nameSize, lines: nameLines } = fitWrappedText(
    ctx,
    recipientLabel,
    pageWidth - 220,
    cin,
    700,
    3,
    54,
    30
  );
  const nameLineHeight = nameSize + 12;
  nameLines.forEach((line, index) => {
    ctx.fillText(line, centerX, pageY + pageHeight * 0.355 + index * nameLineHeight);
  });

  ctx.fillStyle = palette.cream;
  ctx.font = `400 40px ${playfair}`;
  const messageStartY =
    pageY + pageHeight * 0.46 + Math.max(0, nameLines.length - 1) * nameLineHeight;
  const messageLineHeight = 54;
  const messageLines = wrapCanvasText(ctx, messageText || DEFAULT_MESSAGE, pageWidth - 220);
  messageLines.forEach((line, index) => {
    ctx.fillText(line, centerX, messageStartY + index * messageLineHeight);
  });

  const afterMessageY = messageStartY + messageLines.length * messageLineHeight + 30;
  const atentamenteY = Math.min(afterMessageY, pageY + pageHeight * 0.8);
  ctx.font = `600 34px ${playfair}`;
  ctx.fillStyle = accent;
  ctx.fillText("Atentamente.", centerX, atentamenteY);

  const footerY = pageY + pageHeight - 150;
  ctx.font = `700 32px ${cin}`;
  ctx.fillStyle = accent;
  ctx.fillText(signatureLabel, centerX, Math.min(atentamenteY + 58, footerY - 62));

  ctx.font = `700 30px ${cin}`;
  ctx.fillStyle = accent;
  ctx.fillText(orgLabel.toLocaleUpperCase("es-AR"), centerX, footerY);

  if (eyeLogo) {
    const logoWidth = 130;
    const logoHeight = 91;
    ctx.drawImage(eyeLogo, centerX - logoWidth / 2, footerY + 30, logoWidth, logoHeight);
  }
}

function drawDoradoTemplate(ctx: CanvasRenderingContext2D, data: GreetingCardData) {
  drawArtDecoTemplate(ctx, data, DORADO_PALETTE);
}

function drawZafiroTemplate(ctx: CanvasRenderingContext2D, data: GreetingCardData) {
  drawArtDecoTemplate(ctx, data, ZAFIRO_PALETTE);
}

type RibbonPalette = {
  base: string;
  bgStops: [string, string, string];
  accent: string;
  fleckColor: string;
  textLight: string;
};

const ESMERALDA_PALETTE: RibbonPalette = {
  base: "#04120f",
  bgStops: ["#1c5c56", "#123f3b", "#0a2e2c"],
  accent: "#f3ce6b",
  fleckColor: "#f0c94a",
  textLight: "#f6faf9",
};

const RUBI_PALETTE: RibbonPalette = {
  base: "#0e0407",
  bgStops: ["#6b1530", "#43101f", "#210810"],
  accent: "#f3ce6b",
  fleckColor: "#f0c94a",
  textLight: "#f7eef0",
};

function drawRibbonTemplate(ctx: CanvasRenderingContext2D, data: GreetingCardData, palette: RibbonPalette) {
  const { eventDateLabel, recipientLabel, signatureLabel, orgLabel, messageText, eyeLogo, policeLogo, customBackground, backgroundOverlay } = data;
  const { width: canvasWidth, height: canvasHeight } = ctx.canvas;
  const pageX = 42;
  const pageY = 42;
  const pageWidth = canvasWidth - pageX * 2;
  const pageHeight = canvasHeight - pageY * 2;
  const centerX = canvasWidth / 2;
  const gv = greatVibes.style.fontFamily;
  const playfair = playfairDisplay.style.fontFamily;
  const gold = palette.accent;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  drawRoundedRect(ctx, pageX, pageY, pageWidth, pageHeight, 46);
  ctx.clip();
  drawBackgroundLayer(
    ctx,
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    { x0: pageX, y0: pageY, x1: pageX + pageWidth, y1: pageY + pageHeight },
    palette.bgStops,
    customBackground,
    backgroundOverlay
  );

  drawSoftRibbon(
    ctx,
    pageX - 40, pageY + pageHeight * 0.12,
    pageX + pageWidth * 0.3, pageY - 40,
    pageX + pageWidth * 0.6, pageY + pageHeight * 0.25,
    pageX + pageWidth + 40, pageY + pageHeight * 0.05,
    90, 0.05
  );
  drawSoftRibbon(
    ctx,
    pageX - 40, pageY + pageHeight * 0.92,
    pageX + pageWidth * 0.35, pageY + pageHeight + 30,
    pageX + pageWidth * 0.7, pageY + pageHeight * 0.78,
    pageX + pageWidth + 40, pageY + pageHeight * 0.98,
    110, 0.045
  );

  const flecks: Array<[number, number, number, number, number]> = [
    [0.86, 0.05, 16, 0.3, 0.85],
    [0.92, 0.09, 10, 1.1, 0.6],
    [0.8, 0.03, 8, -0.4, 0.7],
    [0.06, 0.1, 12, 0.8, 0.6],
    [0.1, 0.16, 8, -0.2, 0.5],
    [0.9, 0.94, 14, 0.6, 0.75],
    [0.84, 0.97, 9, -0.5, 0.55],
    [0.08, 0.9, 11, 0.2, 0.6],
    [0.04, 0.95, 7, 1.3, 0.45],
    [0.5, 0.02, 9, 0.5, 0.4],
  ];
  flecks.forEach(([xf, yf, size, rot, alpha]) => {
    drawFleck(ctx, pageX + pageWidth * xf, pageY + pageHeight * yf, size, rot, alpha, palette.fleckColor);
  });
  ctx.restore();

  ctx.textAlign = "center";
  if (eyeLogo) {
    const logoWidth = 150;
    const logoHeight = 105;
    ctx.drawImage(eyeLogo, centerX - logoWidth / 2, pageY + pageHeight * 0.025, logoWidth, logoHeight);
  }

  const pillY = pageY + pageHeight * 0.135;
  ctx.font = `600 28px ${playfair}`;
  const orgText = orgLabel.toLocaleUpperCase("es-AR");
  const orgWidth = ctx.measureText(orgText).width;
  const pillWidth = orgWidth + 70;
  drawRoundedRect(ctx, centerX - pillWidth / 2, pillY - 30, pillWidth, 46, 23);
  ctx.fillStyle = "rgba(4,20,17,0.4)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = palette.textLight;
  ctx.fillText(orgText, centerX, pillY);

  ctx.fillStyle = palette.textLight;
  const dateSize = fitScriptText(ctx, eventDateLabel, pageWidth - 500, 90, gv, 400);
  ctx.font = `400 ${dateSize}px ${gv}`;
  ctx.fillText(eventDateLabel, centerX, pageY + pageHeight * 0.225);

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  const headlineSize = fitScriptText(ctx, "Feliz Cumpleaños!", pageWidth - 140, 150, gv, 400);
  ctx.font = `400 ${headlineSize}px ${gv}`;
  ctx.fillText("Feliz Cumpleaños!", centerX, pageY + pageHeight * 0.34);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Serif legible, no el script del título: "Feliz Cumpleaños!" es texto
  // fijo y corto, pero acá va rol + nombre completo (largo y variable), y un
  // cursivo como Great Vibes se vuelve ilegible en tramos largos en
  // mayúsculas sostenidas (apellidos). El dorado mantiene el acento visual
  // sin sacrificar legibilidad.
  ctx.fillStyle = gold;
  const { fontSize: nameSize, lines: nameLines } = fitWrappedText(
    ctx,
    recipientLabel,
    pageWidth - 200,
    playfair,
    600,
    3,
    56,
    28
  );
  const nameLineHeight = nameSize + 12;
  nameLines.forEach((line, index) => {
    ctx.fillText(line, centerX, pageY + pageHeight * 0.46 + index * nameLineHeight);
  });

  ctx.fillStyle = palette.textLight;
  ctx.font = `400 40px ${playfair}`;
  const messageStartY =
    pageY + pageHeight * 0.55 + Math.max(0, nameLines.length - 1) * nameLineHeight;
  const messageLineHeight = 54;
  const messageLines = wrapCanvasText(ctx, messageText || DEFAULT_MESSAGE, pageWidth - 220);
  messageLines.forEach((line, index) => {
    ctx.fillText(line, centerX, messageStartY + index * messageLineHeight);
  });

  const afterMessageY = messageStartY + messageLines.length * messageLineHeight + 26;
  ctx.font = `600 34px ${playfair}`;
  ctx.fillStyle = palette.textLight;
  const atentamenteY = Math.min(afterMessageY, pageY + pageHeight * 0.82);
  ctx.fillText("Atentamente.", centerX, atentamenteY);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX - 140, atentamenteY + 30);
  ctx.lineTo(centerX + 140, atentamenteY + 30);
  ctx.stroke();

  ctx.font = `700 32px ${playfair}`;
  ctx.fillStyle = palette.textLight;
  ctx.fillText(signatureLabel, centerX, atentamenteY + 78);

  if (policeLogo) {
    const sealSize = 120;
    ctx.drawImage(
      policeLogo,
      centerX - sealSize / 2,
      pageY + pageHeight - sealSize - 34,
      sealSize,
      sealSize
    );
  }
}

function drawEsmeraldaTemplate(ctx: CanvasRenderingContext2D, data: GreetingCardData) {
  drawRibbonTemplate(ctx, data, ESMERALDA_PALETTE);
}

function drawRubiTemplate(ctx: CanvasRenderingContext2D, data: GreetingCardData) {
  drawRibbonTemplate(ctx, data, RUBI_PALETTE);
}

function drawGreetingCard(
  ctx: CanvasRenderingContext2D,
  templateId: CardTemplateId,
  data: GreetingCardData
) {
  switch (templateId) {
    case "esmeralda":
      drawEsmeraldaTemplate(ctx, data);
      return;
    case "zafiro":
      drawZafiroTemplate(ctx, data);
      return;
    case "rubi":
      drawRubiTemplate(ctx, data);
      return;
    default:
      drawDoradoTemplate(ctx, data);
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
  const [templateId, setTemplateId] = useState<CardTemplateId>("dorado");
  const [orgLabelOptionId, setOrgLabelOptionId] = useState<OrgLabelOptionId>("dmca");
  const [messageText, setMessageText] = useState(DEFAULT_MESSAGE);
  const [isMessageEditingEnabled, setIsMessageEditingEnabled] = useState(false);
  const [customBackgroundImage, setCustomBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [customBackgroundPreviewUrl, setCustomBackgroundPreviewUrl] = useState<string | null>(null);
  const [isCustomBackgroundLoading, setIsCustomBackgroundLoading] = useState(false);
  const [overlayTone, setOverlayTone] = useState<BackgroundOverlayTone>("oscura");
  const [overlayOpacityPercent, setOverlayOpacityPercent] = useState(0);
  const [isDownloading, setIsDownloading] = useState<"png" | "jpg" | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recipientInputRef = useRef<HTMLInputElement | null>(null);
  const customBackgroundInputRef = useRef<HTMLInputElement | null>(null);
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
  const selectedOrgLabelOption = useMemo(
    () => ORG_LABEL_OPTIONS.find((opt) => opt.id === orgLabelOptionId) ?? ORG_LABEL_OPTIONS[0],
    [orgLabelOptionId]
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

  const handleCustomBackgroundUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("El archivo debe ser una imagen.", "error");
      return;
    }

    if (file.size > MAX_CUSTOM_BACKGROUND_BYTES) {
      showToast("La imagen es muy pesada (máx. 8MB).", "error");
      return;
    }

    setIsCustomBackgroundLoading(true);
    const objectUrl = URL.createObjectURL(file);
    const image = await loadCanvasImage(objectUrl);
    setIsCustomBackgroundLoading(false);

    if (!image) {
      URL.revokeObjectURL(objectUrl);
      showToast("No se pudo cargar la imagen.", "error");
      return;
    }

    setCustomBackgroundImage(image);
    setCustomBackgroundPreviewUrl(objectUrl);
  };

  const clearCustomBackground = () => {
    setCustomBackgroundImage(null);
    setCustomBackgroundPreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      if (customBackgroundPreviewUrl) {
        URL.revokeObjectURL(customBackgroundPreviewUrl);
      }
    };
  }, [customBackgroundPreviewUrl]);

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
    let isCancelled = false;

    const renderPreview = async () => {
      const canvas = previewCanvasRef.current;
      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      await ensureCardFontsLoaded();
      if (isCancelled) {
        return;
      }

      drawGreetingCard(ctx, templateId, {
        eventDateLabel,
        recipientLabel,
        signatureLabel,
        orgLabel: selectedOrgLabelOption.value,
        messageText,
        eyeLogo: cardAssets?.eyeLogo ?? null,
        policeLogo: cardAssets?.policeLogo ?? null,
        customBackground: customBackgroundImage,
        backgroundOverlay: { tone: overlayTone, opacityPercent: overlayOpacityPercent },
      });
    };

    void renderPreview();

    return () => {
      isCancelled = true;
    };
  }, [
    cardAssets,
    templateId,
    eventDateLabel,
    recipientLabel,
    selectedOrgLabelOption.value,
    messageText,
    signatureLabel,
    customBackgroundImage,
    overlayTone,
    overlayOpacityPercent,
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

      await ensureCardFontsLoaded();

      drawGreetingCard(ctx, templateId, {
        eventDateLabel,
        recipientLabel,
        signatureLabel,
        orgLabel: selectedOrgLabelOption.value,
        messageText,
        eyeLogo: assets.eyeLogo,
        policeLogo: assets.policeLogo,
        customBackground: customBackgroundImage,
        backgroundOverlay: { tone: overlayTone, opacityPercent: overlayOpacityPercent },
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
        <div className="gc-panel relative !px-4 !py-3 sm:!px-6 sm:!py-4">
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

        <article className="gc-panel relative !rounded-[1.75rem] !p-4 sm:!p-6 lg:flex-1 lg:min-h-0 lg:!p-4">
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
                  <div className="auth-skeleton h-4 w-20 rounded" />
                  <div className="auth-skeleton h-10 w-full rounded-xl" />
                </div>
                <div className="space-y-2">
                  <div className="auth-skeleton h-4 w-24 rounded" />
                  <div className="grid grid-cols-2 gap-2">
                    {CARD_TEMPLATES.map((option) => (
                      <div
                        key={option.id}
                        className="auth-skeleton aspect-[4/3] rounded-xl"
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
                  <span className="text-sm font-semibold text-slate-100/95">Encabezado</span>
                  <select
                    value={orgLabelOptionId}
                    onChange={(event) => setOrgLabelOptionId(event.target.value as OrgLabelOptionId)}
                    className="gc-select !text-xs !font-semibold"
                  >
                    {ORG_LABEL_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id} className="bg-slate-900 text-slate-100">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-100/95">Plantilla</span>
                  <div className="grid grid-cols-2 gap-2">
                    {CARD_TEMPLATES.map((option) => {
                      const isSelected = option.id === templateId;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTemplateId(option.id)}
                          aria-label={`Seleccionar plantilla ${option.label}`}
                          aria-pressed={isSelected}
                          className={`group flex flex-col overflow-hidden rounded-xl border text-left transition ${
                            isSelected
                              ? "border-sky-300 ring-2 ring-sky-300/35"
                              : "border-white/20 hover:border-white/45"
                          }`}
                        >
                          <span
                            aria-hidden
                            className="aspect-[4/3] w-full"
                            style={{ background: option.swatch }}
                          />
                          <span className="space-y-0.5 bg-slate-900/55 px-2.5 py-2">
                            <span className="block text-xs font-semibold text-slate-100">
                              {option.label}
                            </span>
                            <span className="block text-[10px] text-slate-300/80">
                              {option.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100/95">Fondo personalizado</span>
                    {customBackgroundPreviewUrl && (
                      <button
                        type="button"
                        onClick={clearCustomBackground}
                        className="text-[10px] font-semibold text-sky-300 hover:text-sky-200 transition"
                      >
                        Quitar
                      </button>
                    )}
                  </span>
                  <input
                    ref={customBackgroundInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void handleCustomBackgroundUpload(event);
                    }}
                    className="hidden"
                  />
                  {customBackgroundPreviewUrl ? (
                    <button
                      type="button"
                      onClick={() => customBackgroundInputRef.current?.click()}
                      className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-sky-300 ring-2 ring-sky-300/35"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={customBackgroundPreviewUrl}
                        alt="Fondo personalizado"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-slate-950/45 group-hover:opacity-100">
                        Cambiar imagen
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => customBackgroundInputRef.current?.click()}
                      disabled={isCustomBackgroundLoading}
                      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 bg-slate-900/35 text-slate-300/80 transition hover:border-white/45 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCustomBackgroundLoading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300/35 border-t-slate-100" />
                      ) : (
                        <>
                          <svg
                            aria-hidden
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="m3 16 5-5c.83-.83 2.17-.83 3 0l7 7" />
                            <circle cx="9" cy="9" r="1.5" />
                          </svg>
                          <span className="text-[11px] font-semibold">Subir foto</span>
                        </>
                      )}
                    </button>
                  )}
                  <p className="text-[10px] text-slate-400/80">
                    {customBackgroundPreviewUrl
                      ? "Reemplaza el fondo de la plantilla por esta foto."
                      : "Reemplaza el fondo de la plantilla elegida por una foto propia."}
                  </p>

                  <div className="space-y-2 rounded-xl border border-white/15 bg-slate-900/35 p-2.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100/90">Capa oscura/clara</span>
                      <span className="text-[10px] text-slate-300/70">
                        {overlayOpacityPercent === 0 ? "Sin capa" : `${overlayOpacityPercent}%`}
                      </span>
                    </span>
                    <p className="text-[10px] text-slate-400/70">
                      Resalta o atenúa el fondo ({customBackgroundPreviewUrl ? "la foto" : "la plantilla"}) para que el texto se lea mejor.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setOverlayTone("oscura")}
                        aria-pressed={overlayTone === "oscura"}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                          overlayTone === "oscura"
                            ? "border-sky-300 bg-sky-300/15 text-sky-100"
                            : "border-white/20 text-slate-300/80 hover:border-white/40"
                        }`}
                      >
                        Oscura
                      </button>
                      <button
                        type="button"
                        onClick={() => setOverlayTone("clara")}
                        aria-pressed={overlayTone === "clara"}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                          overlayTone === "clara"
                            ? "border-sky-300 bg-sky-300/15 text-sky-100"
                            : "border-white/20 text-slate-300/80 hover:border-white/40"
                        }`}
                      >
                        Clara
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={5}
                      value={overlayOpacityPercent}
                      onChange={(event) => setOverlayOpacityPercent(Number(event.target.value))}
                      className="w-full accent-sky-400"
                      aria-label="Opacidad de la capa oscura o clara sobre el fondo"
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
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-100/95">Mensaje</span>
                    <span className="flex items-center gap-2">
                      {isMessageEditingEnabled && messageText !== DEFAULT_MESSAGE && (
                        <button
                          type="button"
                          onClick={() => setMessageText(DEFAULT_MESSAGE)}
                          className="text-[10px] font-semibold text-sky-300 hover:text-sky-200 transition"
                        >
                          Restaurar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsMessageEditingEnabled((prev) => !prev)}
                        aria-label={isMessageEditingEnabled ? "Bloquear edición del mensaje" : "Desbloquear edición del mensaje"}
                        aria-pressed={isMessageEditingEnabled}
                        className={`inline-flex items-center justify-center rounded-full border p-2 transition ${
                          isMessageEditingEnabled
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
                          {isMessageEditingEnabled ? (
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
                  </span>
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    disabled={!isMessageEditingEnabled}
                    rows={4}
                    placeholder="Escribí el mensaje de la tarjeta..."
                    className={`resize-none rounded-xl border px-3 py-2 text-sm outline-none ring-sky-300/35 transition focus:ring-2 placeholder:text-slate-400/60 ${
                      isMessageEditingEnabled
                        ? "border-white/20 bg-slate-900/55 text-slate-100"
                        : "border-white/15 bg-slate-900/35 text-slate-300/70 cursor-not-allowed"
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
                    className="gc-input !mt-0"
                  />
                </label>

                <div className="flex flex-wrap gap-2 lg:flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      void downloadImage("png");
                    }}
                    disabled={isDownloading !== null}
                    className={`gc-btn gc-btn-primary ${
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
                    className={`gc-btn gc-btn-ghost ${
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


