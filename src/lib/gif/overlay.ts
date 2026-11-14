import { isEmojiGrapheme, loadAppleEmoji, splitGlyphs } from "@/lib/emoji-ios";

export type TextTone = "white" | "black" | "blue";
export type TextPlate = "none" | "dark" | "light";
export type TextSize = "s" | "m" | "l";

export const TEXT_SIZES: Record<TextSize, number> = {
  s: 0.046,
  m: 0.07,
  l: 0.1,
};

export const TEXT_COLORS: Record<TextTone, string> = {
  white: "#e7eef8",
  black: "#05070d",
  blue: "#5b8cff",
};

const FAMILY = "Outfit, ui-sans-serif, sans-serif";

export type PlacedEmoji = { glyph: string; nx: number; ny: number; scale: number };

export async function renderTextOverlay(
  width: number,
  height: number,
  text: string,
  options: { nx: number; ny: number; size: TextSize; tone: TextTone; plate: TextPlate; bold: boolean },
  stickers: PlacedEmoji[] = [],
): Promise<ImageBitmap> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, width);
  canvas.height = Math.max(2, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the caption.");

  const fontPx = Math.max(18, Math.round(width * TEXT_SIZES[options.size]));
  const weight = options.bold ? 700 : 500;
  await document.fonts.load(`${weight} ${fontPx}px Outfit`);
  await document.fonts.ready;
  ctx.font = `${weight} ${fontPx}px ${FAMILY}`;
  ctx.textBaseline = "middle";

  const needed = new Set<string>();
  for (const glyph of splitGlyphs(text)) {
    if (isEmojiGrapheme(glyph)) needed.add(glyph);
  }
  for (const sticker of stickers) needed.add(sticker.glyph);
  const images = new Map<string, ImageBitmap>();
  await Promise.all(
    [...needed].map(async (glyph) => {
      images.set(glyph, await loadAppleEmoji(glyph));
    }),
  );

  const emojiW = fontPx * 1.08;
  const measure = (glyph: string) => (isEmojiGrapheme(glyph) && images.has(glyph) ? emojiW : ctx.measureText(glyph).width);
  const lines = wrapGraphemes(splitGlyphs(text.trim()), width * 0.86, measure).slice(0, 5);
  const lineH = fontPx * 1.28;
  const widths = lines.map((line) => line.reduce((sum, glyph) => sum + measure(glyph), 0));
  const blockW = Math.max(fontPx, ...widths, 0);
  const blockH = Math.max(1, lines.length) * lineH;
  const x = width * options.nx;
  const y = height * options.ny;
  const hasText = lines.some((line) => line.length > 0);

  if (hasText && options.plate !== "none") {
    const padX = fontPx * 0.55;
    const padY = fontPx * 0.36;
    ctx.fillStyle = options.plate === "dark" ? "rgba(5,7,13,0.84)" : "rgba(231,238,248,0.94)";
    roundRect(ctx, x - blockW / 2 - padX, y - blockH / 2 - padY, blockW + padX * 2, blockH + padY * 2, fontPx * 0.38);
    ctx.fill();
  }

  const fill = options.plate === "light" && options.tone === "white" ? TEXT_COLORS.black : TEXT_COLORS[options.tone];
  ctx.fillStyle = fill;
  if (hasText && options.plate === "none") {
    ctx.shadowColor = options.tone === "black" ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.88)";
    ctx.shadowBlur = fontPx * 0.18;
    ctx.shadowOffsetY = Math.max(1, fontPx * 0.04);
  }

  if (hasText) {
    lines.forEach((line, index) => {
      const ly = y - blockH / 2 + lineH * index + lineH / 2;
      let cursor = x - (widths[index] ?? 0) / 2;
      for (const glyph of line) {
        const w = measure(glyph);
        const image = images.get(glyph);
        if (isEmojiGrapheme(glyph) && image) {
          ctx.drawImage(image, cursor, ly - emojiW / 2, emojiW, emojiW);
        } else {
          ctx.textAlign = "left";
          ctx.fillText(glyph, cursor, ly);
        }
        cursor += w;
      }
    });
  }

  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = Math.max(6, fontPx * 0.12);
  ctx.shadowOffsetY = Math.max(2, fontPx * 0.04);
  for (const sticker of stickers) {
    const image = images.get(sticker.glyph);
    if (!image) continue;
    const size = Math.max(24, width * sticker.scale);
    ctx.drawImage(image, width * sticker.nx - size / 2, height * sticker.ny - size / 2, size, size);
  }

  return createImageBitmap(canvas);
}

function wrapGraphemes(parts: string[], maxWidth: number, measure: (glyph: string) => number): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let width = 0;
  const flush = () => {
    while (line[0] === " ") line.shift();
    while (line[line.length - 1] === " ") line.pop();
    if (line.length > 0) lines.push(line);
    line = [];
    width = 0;
  };
  for (const part of parts) {
    if (part === "\n") {
      flush();
      continue;
    }
    const w = measure(part);
    if (width + w > maxWidth && line.length > 0) {
      flush();
      if (part === " ") continue;
    }
    if (part === " " && line.length === 0) continue;
    line.push(part);
    width += w;
  }
  flush();
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
