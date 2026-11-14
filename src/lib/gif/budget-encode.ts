import { GIFEncoder, quantize } from "gifenc";

/**
 * Budget encoder: finds the best-looking GIF that fits a byte cap.
 *
 * Quality comes from real picture data, never padding:
 *  - one palette built from the whole animation, so colours never flicker
 *  - ordered dithering, which is stable from frame to frame
 *  - only pixels that actually changed are stored in each frame
 *  - every source frame is kept; resolution is the last thing given up
 */

export type Target = {
  /** Largest allowed width / height, in pixels. */
  maxW: number;
  maxH: number;
  /** Largest allowed frame count. */
  maxFrames: number;
  /** Largest allowed width × height × frames. */
  maxPixelFrames: number;
};

export type Size = { width: number; height: number };

export type Scene = {
  /** Long edge at which the sources are shown 1:1. */
  nativeEdge: number;
  /** Start time of every output frame, in ms, ascending from 0. */
  times: number[];
  /** Total loop length in ms. */
  duration: number;
  /** Output size for a given long edge. */
  sizeAt: (edge: number) => Size;
  /** Paint the scene at `timeMs` onto a canvas of `size`. */
  paint: (ctx: OffscreenCanvasRenderingContext2D, size: Size, timeMs: number) => void;
  /** Colours that must stay exact (flat backgrounds). */
  keepColors?: Array<[number, number, number]>;
  /** Fix the output size instead of searching for one. */
  lockEdge?: number;
};

export type Encoded = {
  bytes: Uint8Array;
  width: number;
  height: number;
  frames: number;
  fps: number;
  colors: number;
  /** 0 = every changed pixel stored; higher = tiny changes skipped. */
  smoothing: number;
  /** Output long edge as a fraction of the ceiling (1 = full size). */
  scale: number;
};

type Progress = (ratio: number, label: string) => void;

const TRANSPARENT = 255;
/** Per-channel change that counts as "the same pixel". Tried in this order. */
const SMOOTHING = [1, 8];
const MAX_SMOOTHING = 11;
/** A fixed-size export has no other lever, so it may smooth harder before dropping frames. */
const MAX_SMOOTHING_LOCKED = 22;
const HARD_EDGE = 2560;
const HARD_PIXELS = 4_200_000;
const MIN_EDGE = 240;

// 8×8 Bayer matrix, values 0..63
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30,
  54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
];
const DITHER_AMP = 9;
const DITHER = new Float32Array(64);
for (let i = 0; i < 64; i++) DITHER[i] = ((BAYER[i]! + 0.5) / 64 - 0.5) * DITHER_AMP;

export function even(n: number): number {
  const r = Math.max(2, Math.round(n));
  return r % 2 === 0 ? r : r - 1;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Largest long edge allowed by the target box and the hard limits. */
export function ceilingEdge(scene: Scene, target: Target): number {
  const probe = scene.sizeAt(1000);
  const w = probe.width / 1000;
  const h = probe.height / 1000;
  let edge = Math.min(HARD_EDGE, target.maxW / w, target.maxH / h, Math.sqrt(HARD_PIXELS / (w * h)));
  // never blow a source up more than 2× – past that there is no detail left to show
  edge = Math.min(edge, Math.max(scene.nativeEdge * 2, 480));
  edge = Math.max(MIN_EDGE, Math.floor(edge));
  // sizeAt rounds; step down until the real size is inside the box
  for (let i = 0; i < 40; i++) {
    const s = scene.sizeAt(edge);
    if (s.width <= target.maxW && s.height <= target.maxH && s.width * s.height <= HARD_PIXELS) break;
    edge -= 2;
  }
  return Math.max(MIN_EDGE, edge);
}

/** Merge frames until the count fits `maxFrames`. Keeps the first frame of each merged run. */
export function limitFrames(times: number[], _duration: number, maxFrames: number): number[] {
  if (times.length <= maxFrames) return times;
  let gap = 20;
  let out = times;
  while (out.length > maxFrames && gap < 400) {
    gap += 10;
    out = [];
    let last = -Infinity;
    for (const t of times) {
      if (t - last >= gap) {
        out.push(t);
        last = t;
      }
    }
  }
  if (out.length > maxFrames) out = out.slice(0, maxFrames);
  return out;
}

function delaysFor(times: number[], duration: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const next = i + 1 < times.length ? times[i + 1]! : duration;
    out.push(Math.max(20, Math.round((next - times[i]!) / 10) * 10));
  }
  return out;
}

type Palette = {
  colors: number[][];
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  count: number;
  lut: Int16Array;
};

async function buildPalette(scene: Scene, times: number[]): Promise<Palette> {
  // sample the whole animation at a small size so every scene gets a say
  const edge = Math.min(360, Math.max(160, scene.nativeEdge));
  const size = scene.sizeAt(edge);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const picks = Math.min(times.length, 24);
  const perFrame = Math.floor(420_000 / picks);
  const pixels = size.width * size.height;
  const stride = Math.max(1, Math.floor(pixels / perFrame));
  const take = Math.ceil(pixels / stride);
  const sample = new Uint8ClampedArray(picks * take * 4);
  let j = 0;
  for (let p = 0; p < picks; p++) {
    const at = times[Math.floor((p * times.length) / picks)]!;
    scene.paint(ctx, size, at);
    const data = ctx.getImageData(0, 0, size.width, size.height).data;
    // offset the start per frame so the same pixels aren't sampled every time
    for (let i = p % stride; i < pixels; i += stride) {
      const s = i * 4;
      sample[j++] = data[s]!;
      sample[j++] = data[s + 1]!;
      sample[j++] = data[s + 2]!;
      sample[j++] = 255;
    }
    if (p % 6 === 5) await tick();
  }
  const used = sample.subarray(0, j);
  const colors = quantize(used, 255, { format: "rgb565" }).map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
  refine(colors, used);

  // flat backgrounds must land on an exact palette entry or they would speckle
  for (const keep of scene.keepColors ?? []) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const c = colors[i]!;
      const d = (c[0]! - keep[0]) ** 2 + (c[1]! - keep[1]) ** 2 + (c[2]! - keep[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD < 400 || colors.length >= 255) colors[best] = [keep[0], keep[1], keep[2]];
    else colors.push([keep[0], keep[1], keep[2]]);
  }

  const count = colors.length;
  while (colors.length < 256) colors.push([0, 0, 0]);
  const r = new Uint8Array(256);
  const g = new Uint8Array(256);
  const b = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    r[i] = colors[i]![0]!;
    g[i] = colors[i]![1]!;
    b[i] = colors[i]![2]!;
  }
  const lut = new Int16Array(1 << 18);
  lut.fill(-1);
  return { colors, r, g, b, count, lut };
}

/** Two rounds of k-means on a subsample tighten the palette around the real colours. */
function refine(colors: number[][], sample: Uint8ClampedArray) {
  const n = colors.length;
  const step = Math.max(1, Math.floor(sample.length / 4 / 60_000)) * 4;
  for (let round = 0; round < 2; round++) {
    const sr = new Float64Array(n);
    const sg = new Float64Array(n);
    const sb = new Float64Array(n);
    const sc = new Uint32Array(n);
    for (let i = 0; i < sample.length; i += step) {
      const r = sample[i]!;
      const g = sample[i + 1]!;
      const b = sample[i + 2]!;
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < n; k++) {
        const c = colors[k]!;
        const dr = c[0]! - r;
        const dg = c[1]! - g;
        const db = c[2]! - b;
        const d = dr * dr * 2 + dg * dg * 4 + db * db;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      sr[best]! += r;
      sg[best]! += g;
      sb[best]! += b;
      sc[best]!++;
    }
    for (let k = 0; k < n; k++) {
      const c = sc[k]!;
      if (c > 0) colors[k] = [Math.round(sr[k]! / c), Math.round(sg[k]! / c), Math.round(sb[k]! / c)];
    }
  }
}

function nearest(p: Palette, r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  const { count } = p;
  for (let i = 0; i < count; i++) {
    const dr = p.r[i]! - r;
    const dg = p.g[i]! - g;
    const db = p.b[i]! - b;
    const d = dr * dr * 2 + dg * dg * 4 + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

type Pass = {
  bytes: Uint8Array;
  /** Encoded size of each frame, in order. */
  frameBytes: number[];
  size: Size;
};

/**
 * Encode `frameIdx` (indices into `times`) at `edge` with a smoothing threshold.
 * `fresh` marks frames that must be stored whole (the start of a sample window).
 */
async function encodePass(
  scene: Scene,
  palette: Palette,
  times: number[],
  delays: number[],
  frameIdx: number[],
  fresh: Set<number>,
  edge: number,
  smoothing: number,
  onFrame?: (done: number, total: number) => void,
): Promise<Pass> {
  const size = scene.sizeAt(edge);
  const { width, height } = size;
  const pixels = width * height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const shown = new Uint8Array(pixels * 3);
  const index = new Uint8Array(pixels);
  const { lut, r: pr, g: pg, b: pb } = palette;
  const gif = GIFEncoder({ initialCapacity: Math.min(16_000_000, Math.max(65536, pixels)) });
  const frameBytes: number[] = [];
  let before = 0;

  for (let n = 0; n < frameIdx.length; n++) {
    const f = frameIdx[n]!;
    scene.paint(ctx, size, times[f]!);
    const data = ctx.getImageData(0, 0, width, height).data;
    const whole = n === 0 || fresh.has(f);
    let p = 0;
    let s = 0;
    let q = 0;
    for (let y = 0; y < height; y++) {
      const row = (y & 7) << 3;
      for (let x = 0; x < width; x++, p++, s += 4, q += 3) {
        const r = data[s]!;
        const g = data[s + 1]!;
        const b = data[s + 2]!;
        if (!whole) {
          let d = r - shown[q]!;
          if (d < 0) d = -d;
          if (d <= smoothing) {
            let e = g - shown[q + 1]!;
            if (e < 0) e = -e;
            if (e <= smoothing) {
              e = b - shown[q + 2]!;
              if (e < 0) e = -e;
              if (e <= smoothing) {
                index[p] = TRANSPARENT;
                continue;
              }
            }
          }
        }
        shown[q] = r;
        shown[q + 1] = g;
        shown[q + 2] = b;
        // exact palette hit: leave flat colours alone
        const k0 = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        let c0 = lut[k0]!;
        if (c0 < 0) {
          c0 = nearest(palette, (r & 0xfc) | 2, (g & 0xfc) | 2, (b & 0xfc) | 2);
          lut[k0] = c0;
        }
        if (pr[c0] === r && pg[c0] === g && pb[c0] === b) {
          index[p] = c0;
          continue;
        }
        const d = DITHER[row | (x & 7)]!;
        let rr = r + d;
        let gg = g + d;
        let bb = b + d;
        rr = rr < 0 ? 0 : rr > 255 ? 255 : rr | 0;
        gg = gg < 0 ? 0 : gg > 255 ? 255 : gg | 0;
        bb = bb < 0 ? 0 : bb > 255 ? 255 : bb | 0;
        const k = ((rr >> 2) << 12) | ((gg >> 2) << 6) | (bb >> 2);
        let c = lut[k]!;
        if (c < 0) {
          c = nearest(palette, (rr & 0xfc) | 2, (gg & 0xfc) | 2, (bb & 0xfc) | 2);
          lut[k] = c;
        }
        index[p] = c;
      }
    }
    gif.writeFrame(index, width, height, {
      palette: n === 0 ? palette.colors : undefined,
      delay: delays[f]!,
      repeat: 0,
      transparent: !whole,
      transparentIndex: TRANSPARENT,
      dispose: 1,
    });
    const now = gif.bytesView().byteLength;
    frameBytes.push(now - before);
    before = now;
    onFrame?.(n + 1, frameIdx.length);
    if (n % 2 === 1) await tick();
  }
  gif.finish();
  return { bytes: gif.bytes(), frameBytes, size };
}

/** Predict the full file size from a few short windows of frames. */
async function estimate(
  scene: Scene,
  palette: Palette,
  times: number[],
  delays: number[],
  edge: number,
  smoothing: number,
): Promise<number> {
  const total = times.length;
  if (total <= 20) {
    const pass = await encodePass(scene, palette, times, delays, times.map((_, i) => i), new Set(), edge, smoothing);
    return pass.bytes.byteLength;
  }
  // long enough for slow drifts to cross the smoothing threshold, as they do in a full run
  const win = 7;
  const settle = 3;
  const windows = total > 60 ? 3 : 2;
  const idx: number[] = [];
  const fresh = new Set<number>();
  for (let w = 0; w < windows; w++) {
    const start = Math.min(total - win, Math.floor(((w + 0.5) / windows) * total - win / 2));
    fresh.add(start);
    for (let i = 0; i < win; i++) idx.push(start + i);
  }
  const pass = await encodePass(scene, palette, times, delays, idx, fresh, edge, smoothing);
  let whole = 0;
  let wholeN = 0;
  let delta = 0;
  let deltaN = 0;
  let since = 0;
  idx.forEach((f, i) => {
    if (i === 0 || fresh.has(f)) {
      whole += pass.frameBytes[i]!;
      wholeN++;
      since = 0;
    } else if (++since < settle) {
      // still warming up after a whole frame
    } else {
      delta += pass.frameBytes[i]!;
      deltaN++;
    }
  });
  // the very first frame also carries the header and palette (~800 bytes) – already inside `whole`
  // windows run a little light against a full pass, so lean high
  return whole / wholeN + (delta / Math.max(1, deltaN)) * (total - 1) * 1.08;
}

export async function encodeToBudget(
  scene: Scene,
  target: Target,
  cap: number,
  onProgress: Progress,
): Promise<Encoded> {
  const ceiling = scene.lockEdge ?? ceilingEdge(scene, target);
  const top = scene.sizeAt(ceiling);
  const frameLimit = Math.max(1, Math.min(target.maxFrames, Math.floor(target.maxPixelFrames / (top.width * top.height))));
  let times = limitFrames(scene.times, scene.duration, frameLimit);
  let delays = delaysFor(times, scene.duration);

  onProgress(0.02, "Building the colour palette");
  const palette = await buildPalette(scene, times);

  const goal = cap * 0.975;
  let edge = ceiling;
  let smoothing = SMOOTHING[0]!;

  if (times.length > 1) {
    // 1. full size: find the gentlest smoothing that fits
    const test = async (level: number, step: number) => {
      onProgress(0.06 + step * 0.03, `Testing ${top.width}×${top.height}`);
      return estimate(scene, palette, times, delays, ceiling, level);
    };
    const lightest = SMOOTHING[0]!;
    const heaviest = SMOOTHING[SMOOTHING.length - 1]!;
    let fits = false;
    let last = await test(lightest, 0);
    smoothing = lightest;
    if (last <= goal) {
      fits = true;
    } else {
      const atHeaviest = await test(heaviest, 1);
      smoothing = heaviest;
      last = atHeaviest;
      if (atHeaviest <= goal) {
        fits = true;
        let lo = lightest + 1;
        let hi = heaviest;
        let step = 2;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          const size = await test(mid, step++);
          if (size <= goal) {
            hi = mid;
            last = size;
          } else {
            lo = mid + 1;
          }
        }
        smoothing = hi;
      }
    }

    // 2. still too big: thin out very high frame rates before touching resolution
    if (!fits && !scene.lockEdge && last > goal * 1.6 && times.length > 48) {
      const avg = scene.duration / times.length;
      if (avg < 55) {
        times = limitFrames(scene.times, scene.duration, Math.ceil(times.length * Math.max(0.5, avg / 62)));
        delays = delaysFor(times, scene.duration);
        last = await estimate(scene, palette, times, delays, ceiling, smoothing);
        fits = last <= goal;
      }
    }

    // 3. shrink the picture just enough
    if (!fits && !scene.lockEdge) {
      for (let i = 0; i < 4; i++) {
        const ratio = Math.sqrt(goal / last);
        const next = Math.max(MIN_EDGE, even(edge * Math.min(0.97, ratio * 0.985)));
        if (next >= edge) break;
        edge = next;
        const s = scene.sizeAt(edge);
        onProgress(0.2 + i * 0.03, `Testing ${s.width}×${s.height}`);
        last = await estimate(scene, palette, times, delays, edge, smoothing);
        if (last <= goal || edge <= MIN_EDGE) break;
      }
    }
    if (!fits && scene.lockEdge) smoothing = Math.min(MAX_SMOOTHING_LOCKED, Math.round(smoothing * Math.min(2.5, last / goal)));
  }

  // 4. real encode, corrected if the estimate was off
  const all = times.map((_, i) => i);
  let pass: Pass | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = scene.sizeAt(edge);
    const label = `Encoding ${s.width}×${s.height} · ${times.length} frames`;
    pass = await encodePass(scene, palette, times, delays, all, new Set(), edge, smoothing, (done, total) => {
      onProgress(0.32 + 0.66 * (done / total), label);
    });
    if (pass.bytes.byteLength <= cap) break;
    const over = pass.bytes.byteLength / goal;
    const maxSmoothing = scene.lockEdge ? MAX_SMOOTHING_LOCKED : MAX_SMOOTHING;
    if (smoothing < maxSmoothing && (scene.lockEdge || over < 1.12)) {
      smoothing = Math.min(maxSmoothing, smoothing + (scene.lockEdge ? 4 : 3));
    } else if (!scene.lockEdge && edge > MIN_EDGE) {
      edge = Math.max(MIN_EDGE, even(edge * Math.min(0.96, Math.sqrt(1 / over) * 0.985)));
    } else if (times.length > 2) {
      times = limitFrames(times, scene.duration, Math.ceil(times.length * 0.75));
      delays = delaysFor(times, scene.duration);
      all.length = 0;
      times.forEach((_, i) => all.push(i));
    } else {
      break;
    }
    pass = null;
  }
  if (!pass) throw new Error("Couldn't fit this under the size limit. Try shorter GIFs.");
  if (pass.bytes.byteLength > cap) throw new Error("Couldn't fit this under the size limit. Try shorter GIFs.");

  const avgDelay = delays.reduce((sum, d) => sum + d, 0) / Math.max(1, delays.length);
  return {
    bytes: pass.bytes,
    width: pass.size.width,
    height: pass.size.height,
    frames: times.length,
    fps: Math.max(1, Math.round(1000 / avgDelay)),
    colors: palette.count,
    smoothing,
    scale: edge / ceiling,
  };
}
