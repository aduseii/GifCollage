import { decompressFrames, parseGIF } from "gifuct-js";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { MAX_GIF_BYTES } from "./limits";
import { exactBytes } from "./exact-bytes";

type Fit = "cover" | "contain";

type SingleMsg = {
  op: "text" | "crop" | "compress";
  buffer: ArrayBuffer;
  mime: string;
  maxBytes: number;
  overlay?: ImageBitmap;
  crop?: { x: number; y: number; w: number; h: number };
};

type CellSpan = { c: number; r: number; w: number; h: number };

type StartMsg = {
  buffers: ArrayBuffer[];
  mimes: string[];
  cols: number;
  rows: number;
  aspect: number;
  fit: Fit;
  mat: [number, number, number];
  gutterRatio: number;
  cells?: CellSpan[];
  maxBytes: number;
};

type Decoded = {
  frames: ImageBitmap[];
  delays: number[];
  total: number;
};

type Settings = {
  longEdge: number;
  fps: number;
  colors: number;
  durCap: number;
  dither: number;
  frameCap?: number;
};

type Encoded = {
  bytes: Uint8Array;
  width: number;
  height: number;
  frames: number;
  fps: number;
  colors: number;
};

const MAX_STORED_FRAMES = 48;

const post = (data: unknown, transfer?: Transferable[]) => {
  const scope = self as unknown as {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
  };
  scope.postMessage(data, transfer);
};

addEventListener("message", (event) => {
  const data = (event as MessageEvent<StartMsg | SingleMsg>).data;
  if ("op" in data) {
    void runSingle(data);
    return;
  }
  void run(data as StartMsg);
});

async function run(msg: StartMsg) {
  const cap = msg.maxBytes || MAX_GIF_BYTES;
  try {
    post({ type: "progress", ratio: 0.02, label: "Reading GIFs" });
    const decoded: Array<Decoded | null> = [];
    for (let i = 0; i < msg.buffers.length; i++) {
      const buffer = msg.buffers[i];
      const mime = msg.mimes[i] ?? "";
      if (!buffer) {
        decoded.push(null);
        continue;
      }
      try {
        decoded.push(await decodeAny(buffer, mime, sourceEdge(msg.buffers.length)));
      } catch {
        throw new Error(`Couldn't read cell ${i + 1}. Use a GIF or a still image.`);
      }
      post({
        type: "progress",
        ratio: 0.04 + (0.2 * (i + 1)) / msg.buffers.length,
        label: `Reading GIFs · ${i + 1} of ${msg.buffers.length}`,
      });
    }

    const present = decoded.filter((g): g is Decoded => g !== null);
    if (present.length === 0) throw new Error("Add at least one GIF.");

    const fps = sourceFps(present);
    const colors = 256;
    const dither = 1;
    const durCap = 8000;
    const edge = fitEdge(msg, 4096);

    post({ type: "progress", ratio: 0.26, label: "Rendering full size" });
    const encoded = await renderCollage(
      decoded,
      msg,
      { longEdge: edge, fps, colors, durCap, dither },
      (ratio, label) => {
        post({ type: "progress", ratio: 0.28 + ratio * 0.7, label });
      },
    );

    for (const gif of decoded) gif?.frames.forEach((frame) => frame.close());
    deliver(encoded, cap);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    post({ type: "error", message });
  }
}

function deliver(encoded: Encoded, cap: number) {
  const raw = encoded.bytes.byteLength <= cap ? exactBytes(encoded.bytes, cap) : encoded.bytes;
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const buffer = copy.buffer;
  post(
    {
      type: "done",
      buffer,
      width: encoded.width,
      height: encoded.height,
      frames: encoded.frames,
      fps: encoded.fps,
      colors: encoded.colors,
      bytes: copy.byteLength,
    },
    [buffer],
  );
}

function sourceFps(gifs: Decoded[]): number {
  const delays = gifs.flatMap((gif) => gif.delays).filter((delay) => delay > 0);
  if (delays.length === 0) return 12;
  const average = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
  return Math.max(10, Math.min(20, Math.round(1000 / average)));
}

const MAX_PIXELS = 6_500_000;

function fitEdge(msg: StartMsg, edge: number): number {
  let next = Math.max(320, Math.round(edge));
  for (let i = 0; i < 8; i++) {
    const size = canvasSize(msg.cols, msg.rows, msg.aspect, next, msg.gutterRatio);
    const pixels = size.width * size.height;
    if (pixels <= MAX_PIXELS && size.width <= 4096 && size.height <= 4096) return even(next);
    const scale = Math.min(0.92, Math.sqrt(MAX_PIXELS / Math.max(1, pixels)));
    next = Math.max(320, Math.floor(next * scale));
  }
  return even(next);
}

function sourceEdge(count: number): number {
  if (count <= 2) return 1920;
  if (count <= 4) return 1600;
  if (count <= 6) return 1280;
  return 1080;
}

async function decodeAny(buffer: ArrayBuffer, mime: string, edge: number): Promise<Decoded> {
  if (isGif(buffer, mime)) return decodeGif(buffer, edge);
  return decodeStill(buffer, mime, edge);
}

function isGif(buffer: ArrayBuffer, mime: string): boolean {
  if (mime === "image/gif") return true;
  if (buffer.byteLength < 6) return false;
  const u = new Uint8Array(buffer, 0, 6);
  const sig = String.fromCharCode(u[0]!, u[1]!, u[2]!, u[3]!, u[4]!, u[5]!);
  return sig === "GIF87a" || sig === "GIF89a";
}

async function decodeStill(buffer: ArrayBuffer, mime: string, edge: number): Promise<Decoded> {
  const bmp = await createImageBitmap(new Blob([buffer], { type: mime || "image/png" }));
  const fitted = await fitBitmap(bmp, edge);
  if (fitted !== bmp) bmp.close();
  return { frames: [fitted], delays: [100], total: 100 };
}

async function decodeGif(buffer: ArrayBuffer, edge: number): Promise<Decoded> {
  const parsed = parseGIF(buffer);
  const frames = decompressFrames(parsed, true);
  if (frames.length === 0) throw new Error("empty gif");

  const srcW = parsed.lsd.width;
  const srcH = parsed.lsd.height;
  const keep = Math.min(frames.length, MAX_STORED_FRAMES);
  const budget = 72 * 1024 * 1024;
  const maxPixels = Math.floor(budget / (4 * Math.max(1, keep)));
  const aspect = Math.max(srcW, srcH) / Math.max(1, Math.min(srcW, srcH));
  const memEdge = Math.max(480, Math.floor(Math.sqrt(maxPixels * aspect)));
  const storeEdge = Math.min(edge, memEdge);
  const compScale = Math.min(1, storeEdge / Math.max(srcW, srcH));
  const cw = Math.max(1, Math.round(srcW * compScale));
  const ch = Math.max(1, Math.round(srcH * compScale));
  const canvas = new OffscreenCanvas(cw, ch);
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("no canvas");

  const step = Math.max(1, Math.ceil(frames.length / MAX_STORED_FRAMES));
  const stored: ImageBitmap[] = [];
  const delays: number[] = [];
  let delayAcc = 0;
  const temp = new OffscreenCanvas(1, 1);
  const tempCtx = temp.getContext("2d");
  if (!tempCtx) throw new Error("no canvas");

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame) continue;
    const saved = frame.disposalType === 3 ? ctx.getImageData(0, 0, cw, ch) : null;
    blitPatch(ctx, temp, tempCtx, frame, compScale);

    const delay = Math.max(20, frame.delay || 100);
    delayAcc += delay;
    const keep = i % step === step - 1 || i === frames.length - 1;
    if (keep) {
      stored.push(await snapshot(canvas, storeEdge));
      delays.push(delayAcc);
      delayAcc = 0;
    }

    if (frame.disposalType === 2) {
      const { left, top, width, height } = frame.dims;
      ctx.clearRect(left * compScale, top * compScale, width * compScale, height * compScale);
    } else if (frame.disposalType === 3 && saved) {
      ctx.putImageData(saved, 0, 0);
    }
  }

  if (stored.length === 0) throw new Error("empty gif");
  const total = delays.reduce((sum, n) => sum + n, 0) || 100;
  return { frames: stored, delays, total };
}

function blitPatch(
  ctx: OffscreenCanvasRenderingContext2D,
  temp: OffscreenCanvas,
  tempCtx: OffscreenCanvasRenderingContext2D,
  frame: { dims: { left: number; top: number; width: number; height: number }; patch: Uint8ClampedArray },
  scale: number,
) {
  const { left, top, width, height } = frame.dims;
  if (width <= 0 || height <= 0) return;
  const need = width * height * 4;
  if (frame.patch.length < need) return;
  if (temp.width !== width || temp.height !== height) {
    temp.width = width;
    temp.height = height;
  }
  const data = frame.patch.length === need ? frame.patch : frame.patch.subarray(0, need);
  tempCtx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  ctx.drawImage(temp, left * scale, top * scale, Math.max(1, width * scale), Math.max(1, height * scale));
}

async function snapshot(canvas: OffscreenCanvas, maxEdge: number): Promise<ImageBitmap> {
  const edge = Math.max(canvas.width, canvas.height);
  if (edge <= maxEdge) return createImageBitmap(canvas);
  const scale = maxEdge / edge;
  const dw = Math.max(1, Math.round(canvas.width * scale));
  const dh = Math.max(1, Math.round(canvas.height * scale));
  const small = new OffscreenCanvas(dw, dh);
  const sctx = small.getContext("2d");
  if (!sctx) return createImageBitmap(canvas);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, dw, dh);
  return createImageBitmap(small);
}

async function fitBitmap(bmp: ImageBitmap, maxEdge: number): Promise<ImageBitmap> {
  const edge = Math.max(bmp.width, bmp.height);
  if (edge <= maxEdge) return bmp;
  const scale = maxEdge / edge;
  const dw = Math.max(1, Math.round(bmp.width * scale));
  const dh = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  if (!ctx) return bmp;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, dw, dh);
  return createImageBitmap(canvas);
}

function even(n: number): number {
  const r = Math.max(2, Math.round(n));
  return r % 2 === 0 ? r : r - 1;
}

function canvasSize(cols: number, rows: number, aspect: number, longEdge: number, gutterRatio: number) {
  const gw = (cols - 1) * gutterRatio;
  const gh = (rows - 1) * gutterRatio;
  const widthUnits = cols + gw;
  const heightUnits = (rows + gh) / aspect;
  const cellW = even(longEdge / Math.max(widthUnits, heightUnits));
  const cellH = even(cellW / aspect);
  const gutter = gutterRatio === 0 ? 0 : Math.max(1, Math.round(cellW * gutterRatio));
  const width = cols * cellW + Math.max(0, cols - 1) * gutter;
  const height = rows * cellH + Math.max(0, rows - 1) * gutter;
  return { width, height, cellW, cellH, gutter };
}

function delayForFps(fps: number): number {
  const ms = Math.round(1000 / fps);
  return Math.max(20, Math.round(ms / 10) * 10);
}

function frameAt(gif: Decoded, timeMs: number): ImageBitmap {
  const frames = gif.frames;
  const first = frames[0];
  if (!first) throw new Error("missing frame");
  if (frames.length === 1 || gif.total <= 0) return first;
  let t = timeMs % gif.total;
  for (let i = 0; i < frames.length; i++) {
    const d = gif.delays[i] ?? 100;
    const frame = frames[i];
    if (t < d && frame) return frame;
    t -= d;
  }
  return frames[frames.length - 1] ?? first;
}

function drawFit(
  ctx: OffscreenCanvasRenderingContext2D,
  bmp: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: Fit,
) {
  const scale = fit === "cover" ? Math.max(w / bmp.width, h / bmp.height) : Math.min(w / bmp.width, h / bmp.height);
  const dw = bmp.width * scale;
  const dh = bmp.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(bmp, dx, dy, dw, dh);
  ctx.restore();
}

function samplePixels(data: Uint8ClampedArray, maxPixels: number): Uint8ClampedArray {
  const pixels = data.length >> 2;
  const stride = Math.max(1, Math.ceil(pixels / maxPixels));
  if (stride === 1) return data;
  const count = Math.ceil(pixels / stride);
  const out = new Uint8ClampedArray(count * 4);
  let j = 0;
  for (let i = 0; i < pixels; i += stride) {
    const s = i * 4;
    out[j++] = data[s]!;
    out[j++] = data[s + 1]!;
    out[j++] = data[s + 2]!;
    out[j++] = data[s + 3]!;
  }
  return out.subarray(0, j);
}

async function renderCollage(
  slots: Array<Decoded | null>,
  msg: StartMsg,
  settings: Settings,
  onProgress: (ratio: number, label: string) => void,
): Promise<Encoded> {
  const size = canvasSize(msg.cols, msg.rows, msg.aspect, settings.longEdge, msg.gutterRatio);
  const delay = delayForFps(settings.fps);
  const fps = Math.round(1000 / delay);
  const natural = Math.max(...slots.map((g) => g?.total ?? 0), delay);
  const duration = Math.min(natural, settings.durCap);
  const frameCount = Math.min(
    settings.frameCap ?? 36,
    Math.max(1, Math.min(36, Math.round(duration / delay))),
  );

  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const label = `Filling 14.9 MB · ${size.width}×${size.height}`;
  const colors = Math.max(128, Math.min(256, settings.colors));
  const gif = GIFEncoder({ initialCapacity: Math.min(14_000_000, size.width * size.height) });

  for (let i = 0; i < frameCount; i++) {
    paintFrame(ctx, slots, msg, size, i * delay);
    const data = ctx.getImageData(0, 0, size.width, size.height).data;
    const palette = quantize(samplePixels(data, 120000), colors, { format: "rgb565" });
    const index = await applyDither(data, size.width, size.height, palette, settings.dither);
    gif.writeFrame(index, size.width, size.height, {
      palette,
      delay,
      repeat: 0,
    });
    onProgress(0.3 + (0.66 * (i + 1)) / frameCount, label);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  gif.finish();
  onProgress(0.99, "Checking size");

  return {
    bytes: gif.bytes(),
    width: size.width,
    height: size.height,
    frames: frameCount,
    fps,
    colors,
  };
}

function nearestColor(r: number, g: number, b: number, palette: number[][]): number {
  let best = 0;
  let mindist = 1e100;
  for (let i = 0; i < palette.length; i++) {
    const color = palette[i];
    if (!color) continue;
    const dr = (color[0] ?? 0) - r;
    let dist = dr * dr;
    if (dist > mindist) continue;
    const dg = (color[1] ?? 0) - g;
    dist += dg * dg;
    if (dist > mindist) continue;
    const db = (color[2] ?? 0) - b;
    dist += db * db;
    if (dist > mindist) continue;
    mindist = dist;
    best = i;
  }
  return best;
}

function rgb565Key(r: number, g: number, b: number): number {
  return ((r << 8) & 0xf800) | ((g << 2) & 0x03e0) | (b >> 3);
}

async function applyDither(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: number[][],
  strength: number,
): Promise<Uint8Array> {
  if (strength <= 0.02) return applyPalette(rgba, palette, "rgb565");

  const index = new Uint8Array(width * height);
  const work = new Float32Array(width * height * 3);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 3) {
    work[p] = rgba[i] ?? 0;
    work[p + 1] = rgba[i + 1] ?? 0;
    work[p + 2] = rgba[i + 2] ?? 0;
  }
  const cache = new Int16Array(65536);
  cache.fill(-1);

  for (let y = 0; y < height; y++) {
    const forward = y % 2 === 0;
    const step = forward ? 1 : -1;
    const start = forward ? 0 : width - 1;
    const end = forward ? width : -1;
    for (let x = start; x !== end; x += step) {
      const at = y * width + x;
      const p = at * 3;
      const r = work[p] ?? 0;
      const g = work[p + 1] ?? 0;
      const b = work[p + 2] ?? 0;
      const rr = r < 0 ? 0 : r > 255 ? 255 : r;
      const gg = g < 0 ? 0 : g > 255 ? 255 : g;
      const bb = b < 0 ? 0 : b > 255 ? 255 : b;
      const key = rgb565Key(rr, gg, bb);
      let chosen = cache[key] ?? -1;
      if (chosen < 0) {
        chosen = nearestColor(rr, gg, bb, palette);
        cache[key] = chosen;
      }
      index[at] = chosen;
      const color = palette[chosen];
      if (!color) continue;
      const er = (rr - (color[0] ?? 0)) * strength;
      const eg = (gg - (color[1] ?? 0)) * strength;
      const eb = (bb - (color[2] ?? 0)) * strength;
      spread(work, width, height, x + step, y, er, eg, eb, 7 / 16);
      spread(work, width, height, x - step, y + 1, er, eg, eb, 3 / 16);
      spread(work, width, height, x, y + 1, er, eg, eb, 5 / 16);
      spread(work, width, height, x + step, y + 1, er, eg, eb, 1 / 16);
    }
    if (y % 24 === 23) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return index;
}

function spread(
  work: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  er: number,
  eg: number,
  eb: number,
  factor: number,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const p = (y * width + x) * 3;
  work[p] = (work[p] ?? 0) + er * factor;
  work[p + 1] = (work[p + 1] ?? 0) + eg * factor;
  work[p + 2] = (work[p + 2] ?? 0) + eb * factor;
}

function paintFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  slots: Array<Decoded | null>,
  msg: StartMsg,
  size: { width: number; height: number; cellW: number; cellH: number; gutter: number },
  timeMs: number,
) {
  const [r, g, b] = msg.mat;
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.fillRect(0, 0, size.width, size.height);
  for (let i = 0; i < slots.length; i++) {
    const gif = slots[i];
    if (!gif) continue;
    const cell = msg.cells?.[i] ?? {
      c: i % msg.cols,
      r: Math.floor(i / msg.cols),
      w: 1,
      h: 1,
    };
    const x = cell.c * (size.cellW + size.gutter);
    const y = cell.r * (size.cellH + size.gutter);
    const w = cell.w * size.cellW + Math.max(0, cell.w - 1) * size.gutter;
    const h = cell.h * size.cellH + Math.max(0, cell.h - 1) * size.gutter;
    drawFit(ctx, frameAt(gif, timeMs), x, y, w, h, msg.fit);
  }
}

type NormCrop = { x: number; y: number; w: number; h: number };

async function runSingle(msg: SingleMsg) {
  const cap = msg.maxBytes || MAX_GIF_BYTES;
  if (msg.op === "compress") {
    await runCompress(msg, cap);
    return;
  }
  let decoded: Decoded | null = null;
  try {
    post({ type: "progress", ratio: 0.04, label: "Reading GIF" });
    decoded = await decodeAny(msg.buffer, msg.mime, 8192);
    const crop = clampCrop(msg.crop);
    const frame = decoded.frames[0];
    if (!frame) throw new Error("empty gif");
    const cropW = Math.max(2, frame.width * crop.w);
    const cropH = Math.max(2, frame.height * crop.h);
    const edge = msg.overlay ? Math.max(msg.overlay.width, msg.overlay.height) : Math.max(cropW, cropH);

    post({ type: "progress", ratio: 0.2, label: "Rendering full size" });
    const encoded = await encodeSingle(decoded, msg, crop, edge, 1, undefined, (ratio, label) => {
      post({ type: "progress", ratio: 0.22 + ratio * 0.74, label });
    });
    deliver(encoded, cap);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    post({ type: "error", message });
  } finally {
    decoded?.frames.forEach((frame) => frame.close());
    msg.overlay?.close();
  }
}

function gifHeaderSize(buffer: ArrayBuffer): { width: number; height: number } | null {
  if (buffer.byteLength < 10) return null;
  const view = new Uint8Array(buffer, 0, 10);
  return { width: view[6]! | (view[7]! << 8), height: view[8]! | (view[9]! << 8) };
}

async function runCompress(msg: SingleMsg, cap: number) {
  if (isGif(msg.buffer, msg.mime)) {
    const size = gifHeaderSize(msg.buffer);
    const bytes = new Uint8Array(msg.buffer);
    const raw = bytes.byteLength <= cap ? exactBytes(bytes, cap) : bytes;
    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    const buffer = copy.buffer;
    post(
      {
        type: "done",
        buffer,
        width: size?.width ?? 0,
        height: size?.height ?? 0,
        frames: 0,
        fps: 0,
        colors: 256,
        bytes: copy.byteLength,
      },
      [buffer],
    );
    return;
  }

  let decoded: Decoded | null = null;
  try {
    post({ type: "progress", ratio: 0.04, label: "Reading GIF" });
    decoded = await decodeAny(msg.buffer, msg.mime, 8192);
    const crop = { x: 0, y: 0, w: 1, h: 1 };
    const frame = decoded.frames[0];
    if (!frame) throw new Error("empty gif");
    const edge = Math.max(frame.width, frame.height);
    post({ type: "progress", ratio: 0.16, label: "Rendering full size" });
    const encoded = await encodeSingle(decoded, msg, crop, edge, 1, undefined, (ratio, label) => {
      post({ type: "progress", ratio: 0.22 + ratio * 0.74, label });
    });
    deliver(encoded, cap);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    post({ type: "error", message });
  } finally {
    decoded?.frames.forEach((frame) => frame.close());
    msg.overlay?.close();
  }
}

function clampCrop(crop?: NormCrop): NormCrop {
  if (!crop) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(1, Math.max(0, crop.x));
  const y = Math.min(1, Math.max(0, crop.y));
  const w = Math.min(1 - x, Math.max(0.05, crop.w));
  const h = Math.min(1 - y, Math.max(0.05, crop.h));
  return { x, y, w, h };
}

async function encodeSingle(
  decoded: Decoded,
  msg: SingleMsg,
  crop: NormCrop,
  longEdge: number,
  dither: number,
  frameCap: number | undefined,
  onProgress: (ratio: number, label: string) => void,
): Promise<Encoded> {
  const frame = decoded.frames[0];
  if (!frame) throw new Error("empty gif");
  const sx = Math.max(0, Math.round(crop.x * frame.width));
  const sy = Math.max(0, Math.round(crop.y * frame.height));
  const sw = Math.max(1, Math.min(frame.width - sx, Math.round(crop.w * frame.width)));
  const sh = Math.max(1, Math.min(frame.height - sy, Math.round(crop.h * frame.height)));
  const scale = longEdge / Math.max(sw, sh);
  const width = even(Math.max(2, sw * scale));
  const height = even(Math.max(2, sh * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const gif = GIFEncoder({ initialCapacity: Math.min(14_000_000, width * height) });
  let delaySum = 0;
  const frames = frameCap ? decoded.frames.slice(0, frameCap) : decoded.frames;
  const count = frames.length;
  for (let i = 0; i < count; i++) {
    const bitmap = frames[i];
    if (!bitmap) continue;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    if (msg.overlay) ctx.drawImage(msg.overlay, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const palette = quantize(samplePixels(data, 120000), 256, { format: "rgb565" });
    const index = await applyDither(data, width, height, palette, dither);
    const delay = Math.max(20, Math.round((decoded.delays[i] ?? 100) / 10) * 10);
    delaySum += delay;
    gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
    onProgress((i + 1) / count, msg.op === "compress" ? `Stopping at 14.9 MB · ${width}×${height}` : `Filling 14.9 MB · ${width}×${height}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  gif.finish();
  const avg = delaySum / Math.max(1, count);
  return {
    bytes: gif.bytes(),
    width,
    height,
    frames: count,
    fps: Math.max(1, Math.round(1000 / avg)),
    colors: 256,
  };
}
