import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { exportSingle } from "@/lib/gif/export-client";
import { MAX_GIF_BYTES } from "@/lib/gif/limits";
import { ACCEPT, Chip, Choice, ExportBar, ResultCard, useToolResult } from "./tool-bits";

type Ratio = "free" | "square" | "four" | "wide" | "story";
type Crop = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const RATIOS: Array<{ id: Ratio; label: string; value: number }> = [
  { id: "free", label: "Free", value: 0 },
  { id: "square", label: "Square", value: 1 },
  { id: "four", label: "4:3", value: 4 / 3 },
  { id: "wide", label: "16:9", value: 16 / 9 },
  { id: "story", label: "9:16", value: 9 / 16 },
];

const START: Crop = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };

export function CropTool() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 1, h: 1 });
  const [ratio, setRatio] = useState<Ratio>("free");
  const [crop, setCrop] = useState<Crop>(START);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { result, remember } = useToolResult();
  const frameRef = useRef<HTMLDivElement>(null);
  const jobRef = useRef(0);

  function take(next: File | null) {
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
    setCrop(START);
    setRatio("free");
    remember(null);
    setError(null);
  }

  function setLocked(next: Ratio) {
    setRatio(next);
    const spec = RATIOS.find((item) => item.id === next);
    if (!spec || spec.value === 0) return;
    setCrop((current) => fitRatio(current, spec.value, dims.w / dims.h));
    remember(null);
  }

  function beginDrag(event: ReactPointerEvent, handle: Handle) {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { ...crop, px: event.clientX, py: event.clientY, box };
    const aspect = RATIOS.find((item) => item.id === ratio)?.value ?? 0;
    const imageAspect = dims.w / dims.h;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.px) / start.box.width;
      const dy = (ev.clientY - start.py) / start.box.height;
      if (handle === "move") {
        setCrop({
          x: clamp(start.x + dx, 0, 1 - start.w),
          y: clamp(start.y + dy, 0, 1 - start.h),
          w: start.w,
          h: start.h,
        });
        return;
      }
      setCrop(resizeCrop(start, dx, dy, handle, aspect, imageAspect));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      remember(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  async function onExport() {
    if (!file || busy) return;
    const job = ++jobRef.current;
    setBusy(true);
    setError(null);
    setProgress({ ratio: 0.04, label: "Cropping" });
    try {
      const exported = await exportSingle({
        op: "crop",
        file,
        crop,
        onProgress: (next) => {
          if (jobRef.current === job) setProgress(next);
        },
      });
      if (jobRef.current !== job) return;
      if (exported.bytes > MAX_GIF_BYTES) throw new Error("Export came out over the size limit.");
      const blob = new Blob([exported.buffer], { type: "image/gif" });
      remember({
        url: URL.createObjectURL(blob),
        bytes: blob.size,
        width: exported.width,
        height: exported.height,
        frames: exported.frames,
        fps: exported.fps,
        colors: exported.colors,
        smoothing: exported.smoothing,
        scale: exported.scale,
      });
    } catch (cause) {
      if (jobRef.current !== job) return;
      const message = cause instanceof Error ? cause.message : "Export failed.";
      if (message !== "cancelled") setError(message);
    } finally {
      if (jobRef.current === job) {
        setBusy(false);
        setProgress(null);
      }
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 pb-32">
        <section className="rounded-lg border border-line bg-surface p-3 sm:p-4">
          <Choice label="Crop shape">
            {RATIOS.map((item) => (
              <Chip key={item.id} active={ratio === item.id} onClick={() => setLocked(item.id)}>
                {item.label}
              </Chip>
            ))}
          </Choice>
        </section>

        <section aria-label="Crop preview">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Frame</h2>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2">
              {file ? "Replace GIF" : "Add GIF"}
              <input
                id="crop-gif"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  take(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {url ? (
            <div ref={frameRef} className="relative mx-auto w-fit max-w-full touch-none">
              <img
                src={url}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setDims({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
                }}
                className="max-h-[52dvh] w-auto max-w-full rounded-lg object-contain"
              />
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 bg-canvas/70" style={{ height: `${crop.y * 100}%` }} />
                <div className="absolute inset-x-0 bottom-0 bg-canvas/70" style={{ height: `${(1 - crop.y - crop.h) * 100}%` }} />
                <div className="absolute left-0 bg-canvas/70" style={{ top: `${crop.y * 100}%`, height: `${crop.h * 100}%`, width: `${crop.x * 100}%` }} />
                <div className="absolute right-0 bg-canvas/70" style={{ top: `${crop.y * 100}%`, height: `${crop.h * 100}%`, width: `${(1 - crop.x - crop.w) * 100}%` }} />
              </div>
              <div
                className="absolute cursor-move border-2 border-accent"
                style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
                onPointerDown={(event) => beginDrag(event, "move")}
              >
                <div className="pointer-events-none absolute inset-0">
                  <span className="absolute inset-y-0 left-1/3 w-px bg-ink/30" />
                  <span className="absolute inset-y-0 left-2/3 w-px bg-ink/30" />
                  <span className="absolute inset-x-0 top-1/3 h-px bg-ink/30" />
                  <span className="absolute inset-x-0 top-2/3 h-px bg-ink/30" />
                </div>
                <HandleCorner place="nw" onPointerDown={(event) => beginDrag(event, "nw")} />
                <HandleCorner place="ne" onPointerDown={(event) => beginDrag(event, "ne")} />
                <HandleCorner place="sw" onPointerDown={(event) => beginDrag(event, "sw")} />
                <HandleCorner place="se" onPointerDown={(event) => beginDrag(event, "se")} />
              </div>
            </div>
          ) : (
            <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface text-muted hover:text-ink">
              Drop a GIF to crop
              <input
                id="crop-drop"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(event) => {
                  take(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
            </label>
          )}
          <p className="mt-2 text-sm text-muted">Drag the box to move it. Drag a corner to resize. The GIF keeps its timing.</p>
        </section>

        {result ? (
          <ResultCard result={result} before={file?.size} downloadName="splice-crop.gif" note="" />
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
            {error}
          </p>
        ) : null}
      </div>
      <ExportBar
        busy={busy}
        progress={progress}
        hint={file ? "Set the frame, then export the crop." : "Add a GIF to crop it."}
        ready={!!file && !busy}
        action="Export crop"
        downloadName="splice-crop.gif"
        result={result}
        onRun={() => void onExport()}
      />
    </>
  );
}

function HandleCorner({
  place,
  onPointerDown,
}: {
  place: "nw" | "ne" | "sw" | "se";
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const pos = {
    nw: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
    sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  }[place];
  return (
    <button
      type="button"
      aria-label={`Resize from ${place}`}
      onPointerDown={onPointerDown}
      className={`absolute z-10 flex size-11 items-center justify-center ${pos}`}
    >
      <span className="size-3.5 rounded-sm border-2 border-accent-ink bg-accent" />
    </button>
  );
}

function fitRatio(crop: Crop, ratio: number, imageAspect: number): Crop {
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  let w = crop.w;
  let h = (w * imageAspect) / ratio;
  if (h > 1) {
    h = 1;
    w = (h * ratio) / imageAspect;
  }
  if (w > 1) {
    w = 1;
    h = (w * imageAspect) / ratio;
  }
  const x = clamp(cx - w / 2, 0, 1 - w);
  const y = clamp(cy - h / 2, 0, 1 - h);
  return { x, y, w, h };
}

function resizeCrop(
  start: Crop,
  dx: number,
  dy: number,
  handle: Exclude<Handle, "move">,
  ratio: number,
  imageAspect: number,
): Crop {
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;
  if (handle === "se") {
    w = start.w + dx;
    h = start.h + dy;
  } else if (handle === "sw") {
    w = start.w - dx;
    h = start.h + dy;
    x = start.x + dx;
  } else if (handle === "ne") {
    w = start.w + dx;
    h = start.h - dy;
    y = start.y + dy;
  } else {
    w = start.w - dx;
    h = start.h - dy;
    x = start.x + dx;
    y = start.y + dy;
  }
  w = Math.max(0.12, w);
  h = Math.max(0.12, h);
  if (ratio > 0 && imageAspect > 0) {
    h = (w * imageAspect) / ratio;
    if (handle === "nw" || handle === "ne") y = start.y + start.h - h;
    if (handle === "nw" || handle === "sw") x = start.x + start.w - w;
  }
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  w = Math.max(0.12, Math.min(1, w));
  h = Math.max(0.12, Math.min(1, h));
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), w, h };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
