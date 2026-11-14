import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Download, Loader2 } from "lucide-react";
import { MAX_GIF_BYTES, TARGETS, formatMb, type TargetId } from "@/lib/gif/limits";

export const ACCEPT = "image/gif,image/png,image/jpeg,image/webp,image/avif,.gif";

export type ToolResult = {
  url: string;
  bytes: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  colors: number;
  /** Per-channel change skipped between frames; 1 is visually lossless. */
  smoothing?: number;
  /** Output size as a share of the largest allowed (1 = full size). */
  scale?: number;
  target?: TargetId;
};

export function useToolResult() {
  const [result, setResult] = useState<ToolResult | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);
  function remember(next: ToolResult | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next?.url ?? null;
    setResult(next);
  }
  return { result, remember };
}

export function Choice({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
        active ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function ExportBar({
  busy,
  progress,
  hint,
  ready,
  action,
  downloadName,
  result,
  onRun,
}: {
  busy: boolean;
  progress: { ratio: number; label: string } | null;
  hint: string;
  ready: boolean;
  action: string;
  downloadName: string;
  result: ToolResult | null;
  onRun: () => void;
}) {
  const pct = progress ? Math.round(progress.ratio * 100) : 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="min-w-0 flex-1" aria-live="polite">
          {busy && progress ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm text-ink">{progress.label}</p>
                <span className="text-xs text-muted tabular-nums">{pct}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            <p className="truncate text-sm text-muted">{hint}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result && !busy ? (
            <a
              href={result.url}
              download={downloadName}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
            >
              <Download className="size-4" aria-hidden />
              Download
            </a>
          ) : null}
          <button
            type="button"
            onClick={onRun}
            disabled={!ready}
            className={clsx(
              "inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-opacity",
              result && !busy
                ? "border border-line-strong text-ink hover:bg-surface-2"
                : "bg-accent text-accent-ink hover:opacity-90 disabled:bg-surface-2 disabled:text-muted disabled:opacity-100",
            )}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Working" : result ? "Export again" : action}
          </button>
        </div>
      </div>
    </div>
  );
}

function qualityLine(result: ToolResult): string {
  const s = result.smoothing ?? 0;
  const full = (result.scale ?? 1) >= 0.995;
  const detail = s <= 1 ? "Every frame stored at full detail." : s <= 5 ? "Light compression on near-identical pixels." : "Stronger compression was needed to fit.";
  const size = full ? "Largest size allowed." : `Sized to ${Math.round((result.scale ?? 1) * 100)}% to fit the limit.`;
  return `${size} ${detail}`;
}

export function ResultCard({
  result,
  before,
  downloadName,
  note,
}: {
  result: ToolResult;
  before?: number;
  downloadName: string;
  note: string;
}) {
  const untouched = result.frames === 0;
  const used = Math.min(100, (result.bytes / MAX_GIF_BYTES) * 100);
  const fitsX = result.width > 0 && result.width <= TARGETS.x.maxW && result.height <= TARGETS.x.maxH;
  const stats: Array<[string, string]> = untouched
    ? [["Size", result.width > 0 ? `${result.width}×${result.height}` : "Original"]]
    : [
        ["Size", `${result.width}×${result.height}`],
        ["Frames", String(result.frames)],
        ["Speed", `${result.fps} fps`],
        ["Colours", String(result.colors)],
      ];
  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6" aria-label="Export result">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Export</h2>
          <p className="mt-1 font-display text-3xl leading-none font-semibold tabular-nums">
            {formatMb(result.bytes)}
            <span className="font-sans text-sm font-medium text-muted"> MB of 15</span>
          </p>
        </div>
        <a
          href={result.url}
          download={downloadName}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          <Download className="size-4" aria-hidden />
          Download GIF
        </a>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-accent" style={{ width: `${used}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-6 text-muted">
        {untouched ? "Already under the limit, so it was left exactly as it was. " : `${qualityLine(result)} `}
        {before !== undefined && !untouched ? `Was ${formatMb(before)} MB. ` : null}
        {note}
        {result.width > 0 ? (
          <span className={fitsX ? "text-good" : "text-warn"}>
            {fitsX ? " Fits X's GIF rules." : ` Larger than X accepts (${TARGETS.x.maxW}×${TARGETS.x.maxH}).`}
          </span>
        ) : null}
      </p>
      <img
        src={result.url}
        alt="Exported GIF"
        className="mx-auto mt-4 max-h-[48dvh] w-auto max-w-full rounded-md bg-mat-black object-contain"
      />
    </section>
  );
}
