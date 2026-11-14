import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clsx } from "clsx";
import { Plus, X } from "lucide-react";
import { exportCollage } from "@/lib/gif/export-client";
import { layoutById, layoutsFor, type Count, type Layout } from "@/lib/gif/layouts";
import { MAX_GIF_BYTES, TARGETS, formatMb, type TargetId } from "@/lib/gif/limits";
import { ExportBar, ResultCard, type ToolResult } from "./tool-bits";

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

type Result = ToolResult;

const COUNTS: Count[] = [2, 4, 6, 8];

const ASPECTS: Record<AspectKey, { label: string; value: number }> = {
  square: { label: "Square", value: 1 },
  four: { label: "4:3", value: 4 / 3 },
  wide: { label: "16:9", value: 16 / 9 },
};

const MATS: Record<Mat, { label: string; rgb: [number, number, number]; className: string }> = {
  black: { label: "Black", rgb: [0, 0, 0], className: "bg-mat-black" },
  paper: { label: "White", rgb: [255, 255, 255], className: "bg-mat-paper" },
};

const GAPS: Record<Gap, { label: string; ratio: number; className: string }> = {
  off: { label: "None", ratio: 0, className: "gap-0" },
  line: { label: "Thin", ratio: 0.015, className: "gap-1" },
  open: { label: "Wide", ratio: 0.04, className: "gap-2" },
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
  const [fit, setFit] = useState<Fit>("cover");
  const [target, setTarget] = useState<TargetId>("x");
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
        target,
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
        throw new Error("Export came out over the size limit.");
      }
      const blob = new Blob([exported.buffer], { type: "image/gif" });
      if (blob.size > MAX_GIF_BYTES) throw new Error("Export came out over the size limit.");
      rememberResult({
        url: URL.createObjectURL(blob),
        bytes: blob.size,
        width: exported.width,
        height: exported.height,
        frames: exported.frames,
        fps: exported.fps,
        colors: exported.colors,
        smoothing: exported.smoothing,
        scale: exported.scale,
        target,
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

  const settings = (
    <div className="flex flex-col gap-6">
      <Panel title="Layout" aside={`${count} GIFs`}>
        <div className="grid grid-cols-4 gap-2">
          {COUNTS.map((n) => (
            <Pick key={n} active={count === n} onClick={() => resizeTo(n)} label={`${n} cells`}>
              {n}
            </Pick>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
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
                  "flex flex-col items-center gap-2 rounded-md border px-2 py-3 text-xs font-medium transition-colors",
                  active ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <Glyph layout={item} active={active} />
                {item.label}
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Cells">
        <Row label="Shape">
          <Segment
            value={aspectKey}
            onChange={(value) => {
              setAspectKey(value as AspectKey);
              rememberResult(null);
            }}
            options={(Object.keys(ASPECTS) as AspectKey[]).map((key) => ({ value: key, label: ASPECTS[key].label }))}
          />
        </Row>
        <Row label="Fit">
          <Segment
            value={fit}
            onChange={(value) => {
              setFit(value as Fit);
              rememberResult(null);
            }}
            options={[
              { value: "cover", label: "Fill" },
              { value: "contain", label: "Whole GIF" },
            ]}
          />
        </Row>
        <Row label="Gap">
          <Segment
            value={gap}
            onChange={(value) => {
              setGap(value as Gap);
              rememberResult(null);
            }}
            options={(Object.keys(GAPS) as Gap[]).map((key) => ({ value: key, label: GAPS[key].label }))}
          />
        </Row>
        <Row label="Backing">
          <Segment
            value={mat}
            onChange={(value) => {
              setMat(value as Mat);
              rememberResult(null);
            }}
            options={[
              { value: "black", label: "Black" },
              { value: "paper", label: "White" },
            ]}
          />
        </Row>
      </Panel>

      <Panel title="Export for">
        <Segment
          value={target}
          onChange={(value) => {
            setTarget(value as TargetId);
            rememberResult(null);
          }}
          options={(Object.keys(TARGETS) as TargetId[]).map((key) => ({ value: key, label: TARGETS[key].label }))}
        />
        <p className="text-xs leading-5 text-muted">{TARGETS[target].hint}</p>
      </Panel>
    </div>
  );

  return (
    <>
      <div className="grid gap-6 pb-32 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Collage board">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-sm text-muted">
                {selected !== null
                  ? "Pick another cell to swap places."
                  : filled === 0
                    ? "Drop GIFs onto the board, or add them one cell at a time."
                    : `${filled} of ${count} cells filled. Drag a cell to reorder.`}
              </p>
              <label
                htmlFor={bulkId}
                className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
              >
                <Plus className="size-4" aria-hidden />
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
            <div className="rounded-lg border border-line bg-surface p-4 sm:p-6">
              <div className="board-fit mx-auto" style={{ "--board-aspect": String(boardAspect) } as CSSProperties}>
                <div
                  className={clsx("board-grid grid", GAPS[gap].className, MATS[mat].className)}
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
            </div>
          </section>

          {error ? (
            <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
              {error}
            </p>
          ) : null}

          {result ? (
            <ResultCard
              result={result}
              downloadName={`splice-${cols}x${rows}.gif`}
              note={`Made from ${formatMb(sourceBytes)} MB of source GIFs.`}
            />
          ) : null}
        </div>

        <aside aria-label="Collage settings" className="lg:sticky lg:top-6">
          {settings}
        </aside>
      </div>

      <ExportBar
        busy={busy}
        progress={progress}
        hint={
          filled === count
            ? result
              ? `${formatMb(result.bytes)} MB, ready to download.`
              : "Ready. Export finds the sharpest GIF that fits under 15 MB."
            : `Fill ${count - filled} more ${count - filled === 1 ? "cell" : "cells"} to export.`
        }
        ready={ready}
        action="Export GIF"
        downloadName={`splice-${cols}x${rows}.gif`}
        result={result}
        onRun={() => void onExport()}
      />
    </>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {aside ? <span className="text-xs text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function Pick({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={clsx(
        "h-10 rounded-md border text-sm font-semibold transition-colors",
        active ? "border-accent bg-accent text-accent-ink" : "border-line text-ink hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function Segment({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex min-w-0 rounded-md border border-line bg-canvas p-0.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              "h-9 min-w-0 flex-1 truncate rounded-[5px] px-2 text-sm font-medium transition-colors",
              active ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
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
      className="grid h-7 w-9 shrink-0 gap-0.5"
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      }}
      aria-hidden
    >
      {layout.cells.map((cell, index) => (
        <span
          key={index}
          className={clsx("rounded-[1px]", active ? "bg-accent" : "bg-current opacity-60")}
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
      className={clsx("group relative h-full min-h-0 min-w-0 overflow-hidden", selected && "ring-2 ring-accent ring-inset")}
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
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <Plus className="size-5" aria-hidden />
          <span className="text-xs font-medium">{index + 1}</span>
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
          className="absolute top-2 right-2 z-10 inline-flex size-8 items-center justify-center rounded-md bg-canvas/85 text-ink transition-opacity hover:bg-canvas sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          aria-label={`Remove ${slot.name}`}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
