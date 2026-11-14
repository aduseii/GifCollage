import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Download, Loader2 } from "lucide-react";
import { formatMb } from "@/lib/gif/limits";

export const ACCEPT = "image/gif,image/png,image/jpeg,image/webp,image/avif,.gif";

export type ToolResult = {
  url: string;
  bytes: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  colors: number;
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
        "inline-flex h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors",
        active ? "border-amber bg-amber text-amber-ink" : "border-line bg-canvas text-ink hover:bg-surface-2",
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
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {busy && progress ? (
            <>
              <p className="truncate text-sm text-ink">{progress.label}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full bg-amber transition-[width] duration-200" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{hint}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result && !busy ? (
            <a
              href={result.url}
              download={downloadName}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink"
            >
              <Download className="size-4" aria-hidden />
              Download
            </a>
          ) : null}
          <button
            type="button"
            onClick={onRun}
            disabled={!ready}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink disabled:bg-surface-2 disabled:text-muted"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Working" : action}
          </button>
        </div>
      </div>
    </div>
  );
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
  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-label="Export result">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Ready</h2>
          <p className="mt-1 text-sm text-muted">
            {result.frames > 0
              ? `${result.width}×${result.height} · ${result.frames} frames · ${result.fps} fps · ${result.colors} colors`
              : result.width > 0
                ? `${result.width}×${result.height} · filled to 14.9 MB`
                : "Original file"}
          </p>
        </div>
        <p className="font-display text-2xl font-semibold">
          {formatMb(result.bytes)}
          <span className="text-base font-medium text-muted"> MB</span>
        </p>
      </div>
      <img src={result.url} alt="Exported GIF" className="mx-auto max-h-[42dvh] w-auto max-w-full rounded-md bg-mat-black object-contain" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {before !== undefined ? `${formatMb(before)} MB → ${formatMb(result.bytes)} MB. ` : null}
          {note}
        </p>
        <a
          href={result.url}
          download={downloadName}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber px-4 text-sm font-semibold text-amber-ink"
        >
          <Download className="size-4" aria-hidden />
          Download GIF
        </a>
      </div>
    </section>
  );
}
