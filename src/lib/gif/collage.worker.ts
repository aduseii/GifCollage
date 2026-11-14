import { decompressFrames, parseGIF } from "gifuct-js";
import { MAX_GIF_BYTES } from "./limits";
import { encodeToBudget, even, type Encoded, type Scene, type Size, type Target } from "./budget-encode";

type Fit = "cover" | "contain";

type SingleMsg = {
  op: "text" | "crop" | "compress";
  buffer: ArrayBuffer;
  mime: string;
  maxBytes: number;
  target: Target;
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
  target: Target;
};

type Decoded = {
  frames: ImageBitmap[];
  delays: number[];
  total: number;
};

/** Longest loop a collage will run, in ms. */
const MAX_DURATION = 12_000;
/** Decoded frames kept in memory across all sources, in bytes of RGBA. */
const MEMORY_BUDGET = 640 * 1024 * 1024;



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
  const decoded: Array<Decoded | null> = [];
  try {
    post({ type: "progress", ratio: 0.02, label: "Reading GIFs" });
    const count = msg.buffers.filter(Boolean).length || 1;
    for (let i = 0; i < msg.buffers.length; i++) {
      const buffer = msg.buffers[i];
      const mime = msg.mimes[i] ?? "";
      if (!buffer) {
        decoded.push(null);
        continue;
      }
      try {
        decoded.push(await decodeAny(buffer, mime, 1600, MEMORY_BUDGET / count));
      } catch {
        throw new Error(`Couldn't read cell ${i + 1}. Use a GIF or a still image.`);
      }
      post({
        type: "progress",
        ratio: 0.02 + (0.1 * (i + 1)) / msg.buffers.length,
        label: `Reading GIFs · ${i + 1} of ${msg.buffers.length}`,
      });
    }

    const present = decoded.filter((g): g is Decoded => g !== null);
    if (present.length === 0) throw new Error("Add at least one GIF.");

    const scene = collageScene(decoded, msg);
    const encoded = await encodeToBudget(scene, msg.target, cap, (ratio, label) => {
      post({ type: "progress", ratio: 0.12 + ratio * 0.88, label });
    });
    deliver(encoded);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed.";
    post({ type: "error", message });
  } finally {
    for (const gif of decoded) gif?.frames.forEach((frame) => frame.close());
  }
}

function deliver(encoded: Encoded) {
  const copy = new Uint8Array(encoded.bytes.byteLength);
  copy.set(encoded.bytes);
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
      smoothing: encoded.smoothing,
      scale: encoded.scale,
      bytes: copy.byteLength,
    },
    [buffer],
  );
}

/** Every moment at which any source changes frame, so no source frame is dropped or doubled. */
function mergedTimeline(gifs: Decoded[]): { times: number[]; duration: number } {
  const animated = gifs.filter((gif) => gif.frames.length > 1);
  if (animated.length === 0) return { times: [0], duration: 100 };
  const duration = Math.min(MAX_DURATION, Math.max(...animated.map((gif) => gif.total)));
  const marks = new Set<number>([0]);
  for (const gif of animated) {
    let t = 0;
    let i = 0;
    while (t < duration) {
      marks.add(Math.round(t / 10) * 10);
      t += gif.delays[i % gif.delays.length] ?? 100;
      i++;
      if (i > 5000) break;
    }
  }
  const sorted = [...marks].filter((t) => t < duration).sort((a, b) => a - b);
  const times: number[] = [];
  for (const t of sorted) {
    if (times.length === 0 || t - times[times.length - 1]! >= 20) times.push(t);
  }
  return { times, duration: Math.max(20, Math.round(duration / 10) * 10) };
}

function collageScene(slots: Array<Decoded | null>, msg: StartMsg): Scene {
  const present = slots.filter((g): g is Decoded => g !== null);
  const { times, duration } = mergedTimeline(present);
  const sizeAt = (edge: number) => canvasSize(msg.cols, msg.rows, msg.aspect, edge, msg.gutterRatio);

  // long edge at which the most detailed source is shown 1:1
  const probe = sizeAt(1000);
  let nativeEdge = 240;
  slots.forEach((gif, i) => {
    const first = gif?.frames[0];
    if (!first) return;
    const cell = cellFor(msg, i);
    const w = cell.w * probe.cellW + Math.max(0, cell.w - 1) * probe.gutter;
    const h = cell.h * probe.cellH + Math.max(0, cell.h - 1) * probe.gutter;
    const k = msg.fit === "cover" ? Math.max(w / first.width, h / first.height) : Math.min(w / first.width, h / first.height);
    nativeEdge = Math.max(nativeEdge, 1000 / k);
  });

  return {
    nativeEdge,
    times,
    duration,
    sizeAt,
    keepColors: [msg.mat],
    paint: (ctx, size, timeMs) => paintFrame(ctx, slots, msg, size as CollageSize, timeMs),
  };
}

function cellFor(msg: StartMsg, i: number): CellSpan {
  return msg.cells?.[i] ?? { c: i % msg.cols, r: Math.floor(i / msg.cols), w: 1, h: 1 };
}

async function decodeAny(buffer: ArrayBuffer, mime: string, edge: number, memory: number): Promise<Decoded> {
  if (isGif(buffer, mime)) return decodeGif(buffer, edge, memory);
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

async function decodeGif(buffer: ArrayBuffer, edge: number, memory: number): Promise<Decoded> {
  const parsed = parseGIF(buffer);
  const frames = decompressFrames(parsed, true);
  if (frames.length === 0) throw new Error("empty gif");

  const srcW = parsed.lsd.width;
  const srcH = parsed.lsd.height;
  const MAX_STORED_FRAMES = 600;
  const keep = Math.min(frames.length, MAX_STORED_FRAMES);
  const maxPixels = Math.floor(memory / (4 * Math.max(1, keep)));
  const aspect = Math.max(srcW, srcH) / Math.max(1, Math.min(srcW, srcH));
  const memEdge = Math.max(360, Math.floor(Math.sqrt(maxPixels * aspect)));
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

type CollageSize = Size & { cellW: number; cellH: number; gutter: number };

function canvasSize(cols: number, rows: number, aspect: number, longEdge: number, gutterRatio: number): CollageSize {
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

function paintFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  slots: Array<Decoded | null>,
  msg: StartMsg,
  size: CollageSize,
  timeMs: number,
) {
  const [r, g, b] = msg.mat;
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.fillRect(0, 0, size.width, size.height);
  for (let i = 0; i < slots.length; i++) {
    const gif = slots[i];
    if (!gif) continue;
    const cell = cellFor(msg, i);
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
  let decoded: Decoded | null = null;
  try {
    // a GIF that already fits is handed back untouched: re-encoding could only lose quality
    if (msg.op === "compress" && isGif(msg.buffer, msg.mime) && msg.buffer.byteLength <= cap) {
      const size = gifHeaderSize(msg.buffer);
      const copy = new Uint8Array(msg.buffer.byteLength);
      copy.set(new Uint8Array(msg.buffer));
      post(
        {
          type: "done",
          buffer: copy.buffer,
          width: size?.width ?? 0,
          height: size?.height ?? 0,
          frames: 0,
          fps: 0,
          colors: 256,
          smoothing: 0,
          scale: 1,
          bytes: copy.byteLength,
        },
        [copy.buffer],
      );
      return;
    }

    post({ type: "progress", ratio: 0.03, label: "Reading GIF" });
    decoded = await decodeAny(msg.buffer, msg.mime, 2560, MEMORY_BUDGET);
    const scene = singleScene(decoded, msg);
    const encoded = await encodeToBudget(scene, msg.target, cap, (ratio, label) => {
      post({ type: "progress", ratio: 0.1 + ratio * 0.9, label });
    });
    deliver(encoded);
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

function clampCrop(crop?: NormCrop): NormCrop {
  if (!crop) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(1, Math.max(0, crop.x));
  const y = Math.min(1, Math.max(0, crop.y));
  const w = Math.min(1 - x, Math.max(0.05, crop.w));
  const h = Math.min(1 - y, Math.max(0.05, crop.h));
  return { x, y, w, h };
}

function singleScene(decoded: Decoded, msg: SingleMsg): Scene {
  const first = decoded.frames[0];
  if (!first) throw new Error("empty gif");
  const crop = clampCrop(msg.crop);
  const sx = Math.max(0, Math.round(crop.x * first.width));
  const sy = Math.max(0, Math.round(crop.y * first.height));
  const sw = Math.max(1, Math.min(first.width - sx, Math.round(crop.w * first.width)));
  const sh = Math.max(1, Math.min(first.height - sy, Math.round(crop.h * first.height)));
  const nativeEdge = Math.max(sw, sh);

  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < decoded.frames.length; i++) {
    times.push(t);
    t += Math.max(20, Math.round((decoded.delays[i] ?? 100) / 10) * 10);
  }
  const starts = times.slice();

  return {
    nativeEdge,
    times,
    duration: Math.max(20, t),
    // "compress" promises the same picture size, so the size is fixed when it fits the target
    lockEdge:
      msg.op === "compress" && sw <= msg.target.maxW && sh <= msg.target.maxH ? nativeEdge : undefined,
    sizeAt: (edge) => {
      const scale = edge / nativeEdge;
      return { width: even(Math.max(2, sw * scale)), height: even(Math.max(2, sh * scale)) };
    },
    paint: (ctx, size, timeMs) => {
      let at = 0;
      for (let i = 0; i < starts.length; i++) {
        if (starts[i]! <= timeMs) at = i;
        else break;
      }
      const bitmap = decoded.frames[at] ?? first;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size.width, size.height);
      if (msg.overlay) ctx.drawImage(msg.overlay, 0, 0, size.width, size.height);
    },
  };
}
