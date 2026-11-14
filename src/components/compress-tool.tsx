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
    setProgress({ ratio: 0.04, label: "Locking 14.9 MB" });
    try {
      const exported = await exportSingle({
        op: "compress",
        file,
        onProgress: (next) => {
          if (jobRef.current === job) setProgress(next);
        },
      });
      if (jobRef.current !== job) return;
      if (exported.bytes > MAX_GIF_BYTES) throw new Error("Export came out over 14.9 MB.");
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
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="font-display text-xl font-semibold">Same size, smaller file</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            The picture is not resized. A GIF over 14.9 MB is optimized the way EZGIF does it: frame optimize, then
            lossy compression, then fewer colors only if it still will not fit. The export still locks at 14.9 MB.
          </p>
          {file ? (
            <p className="mt-3 text-sm text-ink">
              {file.name} · <span className={over ? "text-amber" : "text-ink"}>{formatMb(file.size)} MB</span>
              {over ? " · starts over 14.9 MB" : " · starts under 14.9 MB"}
            </p>
          ) : null}
        </section>

        <section aria-label="Compress preview">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">GIF</h2>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2">
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
              Drop a GIF to lock at 14.9 MB
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
            downloadName="splice-149.gif"
            note="Locked at 14.9 MB. Nothing from this app exports smaller."
          />
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber">
            {error}
          </p>
        ) : null}
      </div>
      <ExportBar
        busy={busy}
        progress={progress}
        hint={file ? "Keeps the pixel size. Lossy-optimizes only if the file is over 14.9 MB." : "Add a GIF. The picture will not be resized."}
        ready={!!file && !busy}
        action="Lock 14.9"
        downloadName="splice-149.gif"
        result={result}
        onRun={() => void onExport()}
      />
    </>
  );
}
