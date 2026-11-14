import { useRef, useState } from "react";
import { exportSingle } from "@/lib/gif/export-client";
import { MAX_GIF_BYTES, formatMb } from "@/lib/gif/limits";
import { ACCEPT, ExportBar, ResultCard, useToolResult } from "./tool-bits";

export function CompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { result, remember } = useToolResult();
  const jobRef = useRef(0);
  const over = !!file && file.size > MAX_GIF_BYTES;

  function take(next: File | null) {
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
    remember(null);
    setError(null);
  }

  async function onExport() {
    if (!file || busy) return;
    const job = ++jobRef.current;
    setBusy(true);
    setError(null);
    setProgress({ ratio: 0.04, label: "Checking size" });
    try {
      const exported = await exportSingle({
        op: "compress",
        file,
        onProgress: (next) => {
          if (jobRef.current === job) setProgress(next);
        },
      });
      if (jobRef.current !== job) return;
      if (exported.bytes > MAX_GIF_BYTES) throw new Error("Export came out over the size limit.");
      const type = exported.frames === 0 ? file.type || "image/gif" : "image/gif";
      const blob = new Blob([exported.buffer], { type });
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
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Same picture size, smaller file</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            A GIF over 15 MB is rebuilt at the same width and height: unchanged pixels are dropped from each frame
            first, and stronger compression is used only if it still does not fit. A GIF already under the limit is
            left untouched.
          </p>
          {file ? (
            <p className="mt-3 text-sm text-ink">
              {file.name} · <span className={over ? "text-accent" : "text-ink"}>{formatMb(file.size)} MB</span>
              {over ? " · over the limit" : " · already under the limit"}
            </p>
          ) : null}
        </section>

        <section aria-label="Compress preview">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">GIF</h2>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2">
              {file ? "Replace GIF" : "Add GIF"}
              <input
                id="compress-gif"
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
            <img src={url} alt="" className="mx-auto max-h-[48dvh] w-auto max-w-full rounded-lg bg-mat-black object-contain" />
          ) : (
            <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface text-muted hover:text-ink">
              Choose a GIF to compress
              <input
                id="compress-drop"
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
        </section>

        {result ? (
          <ResultCard
            result={result}
            before={file?.size}
            downloadName="splice-compressed.gif"
            note=""
          />
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
        hint={file ? "Keeps the width and height. Compresses only if the file is over 15 MB." : "Add a GIF. It will not be resized."}
        ready={!!file && !busy}
        action="Compress"
        downloadName="splice-compressed.gif"
        result={result}
        onRun={() => void onExport()}
      />
    </>
  );
}
