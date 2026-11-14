/** Hard ceiling: 14.9 MB decimal, safely under a 15 MB upload limit. */
export const MAX_GIF_BYTES = 14_900_000;

export function formatMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(2);
}

export type TargetId = "x" | "max";

export type TargetSpec = {
  id: TargetId;
  label: string;
  hint: string;
  maxW: number;
  maxH: number;
  maxFrames: number;
  maxPixelFrames: number;
};

/**
 * Where the GIF is going. X rejects or mangles GIFs past 1280×1080, 350 frames,
 * or 300 million pixels in total, so the default stays inside those.
 */
export const TARGETS: Record<TargetId, TargetSpec> = {
  x: {
    id: "x",
    label: "X / Twitter",
    hint: "Up to 1280×1080 and 350 frames, the most X accepts.",
    maxW: 1280,
    maxH: 1080,
    maxFrames: 350,
    maxPixelFrames: 300_000_000,
  },
  max: {
    id: "max",
    label: "Largest",
    hint: "Up to 2560 px. For sites with no size rules.",
    maxW: 2560,
    maxH: 2560,
    maxFrames: 600,
    maxPixelFrames: 900_000_000,
  },
};
