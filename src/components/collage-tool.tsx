import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clsx } from "clsx";
import { Download, Loader2, Plus, X } from "lucide-react";
import { exportCollage } from "@/lib/gif/export-client";
import { layoutById, layoutsFor, type Count, type Layout } from "@/lib/gif/layouts";
import { MAX_GIF_BYTES, formatMb } from "@/lib/gif/limits";

type Fit = "cover" | "contain";
type Mat = "black" | "paper";
type Gap = "off" | "line" | "open";
type AspectKey = "square" | "four" | "wide";

type Slot = {
  url: string;
  name: string;
  file: File;
  bytes: number;
};

type Result = {
  url: string;
  bytes: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  colors: number;
};

const COUNTS: Count[] = [2, 4, 6, 8];

const ASPECTS: Record<AspectKey, { label: string; value: number }> = {
  square: { label: "Square", value: 1 },
  four: { label: "4:3", value: 4 / 3 },
  wide: { label: "16:9", value: 16 / 9 },
};

const MATS: Record<Mat, { label: string; rgb: [number, number, number]; className: string }> = {
  black: { label: "Black", rgb: [0, 0, 0], className: "bg-mat-black" },
  paper: { label: "Paper", rgb: [232, 238, 248], className: "bg-mat-paper" },
};

const GAPS: Record<Gap, { label: string; ratio: number; className: string }> = {
  off: { label: "None", ratio: 0, className: "gap-0" },
  line: { label: "Hairline", ratio: 0.015, className: "gap-1" },
  open: { label: "Open", ratio: 0.04, className: "gap-2" },
};

const ACCEPT = "image/gif,image/png,image/jpeg,image/webp,image/avif,.gif";

function acceptable(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name);
}

function slotFromFile(file: File): Slot | null {
  if (!acceptable(file)) return null;
  return {
    url: URL.createObjectURL(file),
    name: file.name,
    file,
    bytes: file.size,
  };
}

export function CollageTool() {
  const [count, setCount] = useState<Count>(4);
  const [layoutId, setLayoutId] = useState("grid");
  const [aspectKey, setAspectKey] = useState<AspectKey>("four");
  const [fit, setFit] = useState<Fit>("contain");
  const [mat, setMat] = useState<Mat>("black");
  const [gap, setGap] = useState<Gap>("line");
  const [slots, setSlots] = useState<Array<Slot | null>>([null, null, null, null]);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const dragFrom = useRef<number | null>(null);
  const jobRef = useRef(0);
  const resultUrl = useRef<string | null>(null);
  const bulkId = "add-gifs";

  const layout = layoutById(count, layoutId);
  const { cols, rows } = layout;
  const cellAspect = ASPECTS[aspectKey].value;
  const gutter = GAPS[gap].ratio;
  const boardAspect =
    (cellAspect * (cols + Math.max(0, cols - 1) * gutter)) / (rows + Math.max(0, rows - 1) * gutter);
  const filled = slots.filter((slot): slot is Slot => slot !== null).length;
  const ready = filled === count && !busy;
  const sourceBytes = slots.reduce((sum, slot) => sum + (slot?.bytes ?? 0), 0);

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    };
  }, []);

  function rememberResult(next: Result | null) {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = next?.url ?? null;
    setResult(next);
  }

  function resizeTo(nextCount: Count) {
    setCount(nextCount);
    setLayoutId((current) => layoutById(nextCount, current).id);
    setSelected(null);
    setSlots((prev) => {
      const next = prev.slice(0, nextCount);
      prev.slice(nextCount).forEach((slot) => slot && URL.revokeObjectURL(slot.url));
      while (next.length < nextCount) next.push(null);
      return next;
    });
    rememberResult(null);
  }

  function putSlot(index: number, file: File) {
    const slot = slotFromFile(file);
    if (!slot) {
      setError("That file isn't a GIF or image.");
      return;
    }
    setError(null);
    setSlots((prev) => {
      const next = prev.slice();
      const old = next[index];
      if (old) URL.revokeObjectURL(old.url);
      next[index] = slot;
      return next;
    });
    rememberResult(null);
  }

  function fillFiles(files: File[]) {
    const usable = files.filter(acceptable);
    if (usable.length === 0) {
      setError("Drop GIFs or still images.");
      return;
    }
    setError(null);
    setSlots((prev) => {
      const next = prev.slice();
      let cursor = 0;
      for (const file of usable) {
        let index = next.findIndex((slot, i) => slot === null && i >= cursor);
        if (index === -1) index = next.findIndex((slot) => slot === null);
        if (index === -1) break;
        cursor = index + 1;
        const slot = slotFromFile(file);
        if (!slot) continue;
        const old = next[index];
        if (old) URL.revokeObjectURL(old.url);
        next[index] = slot;
      }
      return next;
    });
    rememberResult(null);
  }

  function clearSlot(index: number) {
    setSlots((prev) => {
      const next = prev.slice();
      const old = next[index];
      if (old) URL.revokeObjectURL(old.url);
      next[index] = null;
      return next;
    });
    if (selected === index) setSelected(null);
    rememberResult(null);
  }

  function swap(a: number, b: number) {
    if (a === b) return;
    setSlots((prev) => {
      const next = prev.slice();
      const hold = next[a];
      next[a] = next[b] ?? null;
      next[b] = hold ?? null;
      return next;
    });
    rememberResult(null);
  }

  function onCellActivate(index: number) {
    if (selected === null) {
      if (slots[index]) setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }
    swap(selected, index);
    setSelected(null);
  }

  async function onExport() {
    if (!ready) return;
    const job = ++jobRef.current;
    setBusy(true);
    setError(null);
    setProgress({ ratio: 0.01, label: "Starting" });
    try {
      const files = slots.map((slot) => slot?.file).filter((file): file is File => !!file);
      const exported = await exportCollage({
        files,
        cols,
        rows,
        aspect: ASPECTS[aspectKey].value,
        fit,
        mat: MATS[mat].rgb,
        gutterRatio: GAPS[gap].ratio,
        cells: layout.cells,
        onProgress: (next) => {
          if (jobRef.current === job) setProgress(next);
        },
      });
      if (jobRef.current !== job) return;
      if (exported.bytes > MAX_GIF_BYTES) {
        throw new Error("Export came out over 14.9 MB.");
      }
      const blob = new Blob([exported.buffer], { type: "image/gif" });
      if (blob.size > MAX_GIF_BYTES) throw new Error("Export came out over 14.9 MB.");
      rememberResult({
        url: URL.createObjectURL(blob),
        bytes: blob.size,
        width: exported.width,
        height: exported.height,
        frames: exported.frames,
        fps: exported.fps,
        colors: exported.colors,
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
      <div className="flex flex-col gap-4 pb-40">
        <section className="rounded-lg border border-line bg-surface p-3 sm:p-4" aria-label="Collage settings">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Group label="Cells">
                {COUNTS.map((n) => {
                  const shape = layoutsFor(n)[0]!;
                  const active = count === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={active}
                      onClick={() => resizeTo(n)}
                      className={clsx(
                        "inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
                        active
                          ? "border-amber bg-amber text-amber-ink"
                          : "border-line bg-canvas text-ink hover:bg-surface-2",
                      )}
                    >
                      <Glyph layout={shape} active={active} />
                      {n}
                    </button>
                  );
                })}
              </Group>
              <label
                htmlFor={bulkId}
                className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-canvas px-3 text-sm font-medium text-ink hover:bg-surface-2"
              >
                Add GIFs
                <input
                  id={bulkId}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const list = event.target.files;
                    if (list) fillFiles(Array.from(list));
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Group label="Design" className="col-span-2 lg:col-span-3">
                <div className="flex flex-wrap gap-1.5">
                  {layoutsFor(count).map((item) => {
                    const active = item.id === layout.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setLayoutId(item.id);
                          rememberResult(null);
                        }}
                        className={clsx(
                          "inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium",
                          active
                            ? "border-amber bg-amber text-amber-ink"
                            : "border-line bg-canvas text-ink hover:bg-surface-2",
                        )}
                      >
                        <Glyph layout={item} active={active} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </Group>
              <Group label="Shape" className="col-span-2 lg:col-span-1">
                <Segment
                  value={aspectKey}
                  onChange={(value) => {
                    setAspectKey(value as AspectKey);
                    rememberResult(null);
                  }}
                  options={(Object.keys(ASPECTS) as AspectKey[]).map((key) => ({
                    value: key,
                    label: ASPECTS[key].label,
                  }))}
                />
              </Group>
              <Group label="Fit">
                <Segment
                  value={fit}
                  onChange={(value) => {
                    setFit(value as Fit);
                    rememberResult(null);
                  }}
                  options={[
                    { value: "contain", label: "Contain" },
                    { value: "cover", label: "Cover" },
                  ]}
                />
              </Group>
              <Group label="Mat">
                <Segment
                  value={mat}
                  onChange={(value) => {
                    setMat(value as Mat);
                    rememberResult(null);
                  }}
                  options={[
                    { value: "black", label: "Black" },
                    { value: "paper", label: "Paper" },
                  ]}
                />
              </Group>
              <Group label="Gap" className="col-span-2 lg:col-span-1">
                <Segment
                  value={gap}
                  onChange={(value) => {
                    setGap(value as Gap);
                    rememberResult(null);
                  }}
                  options={(Object.keys(GAPS) as Gap[]).map((key) => ({
                    value: key,
                    label: GAPS[key].label,
                  }))}
                />
              </Group>
            </div>
          </div>
        </section>

        <section aria-label="Collage board">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Board</h2>
            <p className="text-sm text-muted">
              {selected !== null ? "Tap another cell to swap." : `${filled} of ${count} filled`}
            </p>
          </div>
          <div className="board-fit mx-auto" style={{ "--board-aspect": String(boardAspect) } as CSSProperties}>
            <div
              className={clsx("board-grid grid rounded-lg p-1", GAPS[gap].className, MATS[mat].className)}
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                if (dragFrom.current !== null) return;
                const files = Array.from(event.dataTransfer.files ?? []);
                if (files.length) fillFiles(files);
              }}
            >
              {slots.map((slot, index) => (
                <Cell
                  key={index}
                  index={index}
                  span={layout.cells[index]}
                  slot={slot}
                  matClass={MATS[mat].className}
                  fit={fit}
                  selected={selected === index}
                  onActivate={() => onCellActivate(index)}
                  onFile={(file) => putSlot(index, file)}
                  onClear={() => clearSlot(index)}
                  onDragStart={() => {
                    dragFrom.current = index;
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                  }}
                  onDropSlot={() => {
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    if (from !== null) swap(from, index);
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {result ? (
          <section className="rounded-lg border border-line bg-surface p-4" aria-label="Export result">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Ready</h2>
                <p className="mt-1 text-sm text-muted">
                  {result.width}×{result.height} · {result.frames} frames · {result.fps} fps · {result.colors}{" "}
                  colors
                </p>
              </div>
              <p className="font-display text-2xl font-semibold">
                {formatMb(result.bytes)}
                <span className="text-base font-medium text-muted"> / 14.9 MB</span>
              </p>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-canvas" aria-hidden>
              <div
                className="h-full bg-amber"
                style={{ width: `${Math.min(100, (result.bytes / MAX_GIF_BYTES) * 100)}%` }}
              />
            </div>
            <img
              src={result.url}
              alt="Exported GIF collage"
              className="mx-auto max-h-[42dvh] w-auto max-w-full rounded-md bg-mat-black object-contain"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Sources {formatMb(sourceBytes)} MB → collage {formatMb(result.bytes)} MB
              </p>
              <a
                href={result.url}
                download={`splice-${cols}x${rows}.gif`}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink"
              >
                <Download className="size-4" aria-hidden />
                Download GIF
              </a>
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber">
            {error}
          </p>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {busy && progress ? (
              <>
                <p className="truncate text-sm text-ink">{progress.label}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-amber transition-[width] duration-200"
                    style={{ width: `${Math.round(progress.ratio * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                {filled === count
                  ? result
                    ? `${formatMb(result.bytes)} MB · highest resolution that still fits.`
                    : "Every collage is built to 14.9 MB."
                  : `Fill ${count - filled} more ${count - filled === 1 ? "cell" : "cells"} to export.`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result && !busy ? (
              <a
                href={result.url}
                download={`splice-${cols}x${rows}.gif`}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink"
              >
                <Download className="size-4" aria-hidden />
                Download
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={!ready}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink disabled:bg-surface-2 disabled:text-muted"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Splicing" : "Export collage"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Group({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={clsx("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Segment({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <div className="flex min-w-0 flex-1 gap-1.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={clsx(
              "inline-flex h-11 flex-1 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors disabled:opacity-40",
              active
                ? "border-amber bg-amber text-amber-ink"
                : "border-line bg-canvas text-ink hover:bg-surface-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Glyph({ layout, active }: { layout: Layout; active: boolean }) {
  return (
    <span
      className="grid h-6 w-6 shrink-0 gap-px"
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      }}
      aria-hidden
    >
      {layout.cells.map((cell, index) => (
        <span
          key={index}
          className={active ? "bg-amber-ink" : "bg-current"}
          style={{ gridColumn: `${cell.c + 1} / span ${cell.w}`, gridRow: `${cell.r + 1} / span ${cell.h}` }}
        />
      ))}
    </span>
  );
}

function Cell({
  index,
  span,
  slot,
  matClass,
  fit,
  selected,
  onActivate,
  onFile,
  onClear,
  onDragStart,
  onDragEnd,
  onDropSlot,
}: {
  index: number;
  span?: { c: number; r: number; w: number; h: number };
  slot: Slot | null;
  matClass: string;
  fit: Fit;
  selected: boolean;
  onActivate: () => void;
  onFile: (file: File) => void;
  onClear: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropSlot: () => void;
}) {
  const inputId = `cell-${index}`;
  return (
    <div
      className={clsx("relative h-full min-h-0 min-w-0 overflow-hidden rounded-md", selected && "ring-2 ring-amber ring-inset")}
      style={span ? { gridColumn: `${span.c + 1} / span ${span.w}`, gridRow: `${span.r + 1} / span ${span.h}` } : undefined}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
        else onDropSlot();
      }}
    >
      {slot ? (
        <button
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("text/plain", String(index));
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onClick={onActivate}
          className="absolute inset-0 block"
          aria-label={`Cell ${index + 1}, ${slot.name}. Activate to swap.`}
          aria-pressed={selected}
        >
          <img
            src={slot.url}
            alt=""
            draggable={false}
            className={clsx("h-full w-full", matClass, fit === "contain" ? "object-contain" : "object-cover")}
          />
        </button>
      ) : (
        <label
          htmlFor={inputId}
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-surface text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Plus className="size-5" aria-hidden />
          <span className="text-xs font-medium">Add</span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
        </label>
      )}
      {slot ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute top-0.5 right-0.5 z-10 inline-flex size-11 items-center justify-center rounded-md bg-canvas/80 text-ink"
          aria-label={`Remove ${slot.name}`}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
