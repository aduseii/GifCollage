/** Hard ceiling: 14.9 MB decimal, safely under a 15 MB upload limit. */
export const MAX_GIF_BYTES = 14_900_000;

/** Same pixel budget the collage uses so a single GIF can spend the full 14.9 MB. */
export const MAX_PIXELS = 6_500_000;

export function formatMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(2);
}

function even(n: number): number {
  const r = Math.max(2, Math.round(n));
  return r % 2 === 0 ? r : r - 1;
}

/** Largest even frame at or above the source, capped like a collage. */
export function frameCeiling(width: number, height: number): { width: number; height: number; edge: number } {
  const srcW = Math.max(2, width);
  const srcH = Math.max(2, height);
  const srcEdge = Math.max(srcW, srcH);
  let edge = Math.min(4096, Math.max(srcEdge, 2400));
  for (let i = 0; i < 12; i++) {
    const scale = edge / srcEdge;
    const w = even(srcW * scale);
    const h = even(srcH * scale);
    if (w * h <= MAX_PIXELS && w <= 4096 && h <= 4096) {
      return { width: w, height: h, edge: Math.max(w, h) };
    }
    edge = Math.max(360, Math.floor(edge * 0.9));
  }
  const scale = 360 / srcEdge;
  const w = even(srcW * scale);
  const h = even(srcH * scale);
  return { width: w, height: h, edge: Math.max(w, h) };
}