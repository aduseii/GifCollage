import { MAX_GIF_BYTES } from "./limits";
import { exactBytes } from "./exact-bytes";
import { squeezeToCap } from "./squeeze";

export type ExportProgress = { ratio: number; label: string };

export type ExportResult = {
  buffer: ArrayBuffer;
  bytes: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  colors: number;
};

export type ExportJob = {
  files: File[];
  cols: number;
  rows: number;
  aspect: number;
  fit: "cover" | "contain";
  mat: [number, number, number];
  gutterRatio: number;
  cells: Array<{ c: number; r: number; w: number; h: number }>;
  onProgress: (progress: ExportProgress) => void;
};

export type SingleJob = {
  op: "text" | "crop" | "compress";
  file: File;
  overlay?: ImageBitmap;
  crop?: { x: number; y: number; w: number; h: number };
  onProgress: (progress: ExportProgress) => void;
};

let activeReject: ((error: Error) => void) | null = null;
let activeWorker: Worker | null = null;

export function exportCollage(job: ExportJob): Promise<ExportResult> {
  return runWorker(job.onProgress, async (worker, settled) => {
    const buffers = await Promise.all(job.files.map((file) => file.arrayBuffer()));
    if (settled()) return;
    worker.postMessage(
      {
        buffers,
        mimes: job.files.map((file) => file.type),
        cols: job.cols,
        rows: job.rows,
        aspect: job.aspect,
        fit: job.fit,
        mat: job.mat,
        gutterRatio: job.gutterRatio,
        cells: job.cells,
        maxBytes: MAX_GIF_BYTES,
      },
      buffers,
    );
  });
}

export function exportSingle(job: SingleJob): Promise<ExportResult> {
  return runWorker(job.onProgress, async (worker, settled) => {
    const buffer = await job.file.arrayBuffer();
    if (settled()) return;
    const transfer: Transferable[] = [buffer];
    if (job.overlay) transfer.push(job.overlay);
    worker.postMessage(
      {
        op: job.op,
        buffer,
        mime: job.file.type,
        maxBytes: MAX_GIF_BYTES,
        overlay: job.overlay,
        crop: job.crop,
      },
      transfer,
    );
  });
}

function runWorker(
  onProgress: (progress: ExportProgress) => void,
  send: (worker: Worker, settled: () => boolean) => Promise<void>,
): Promise<ExportResult> {
  activeWorker?.terminate();
  activeReject?.(new Error("cancelled"));
  activeWorker = null;
  activeReject = null;

  const worker = new Worker(new URL("./collage.worker.ts", import.meta.url), { type: "module" });
  activeWorker = worker;

  return new Promise((resolve, reject) => {
    activeReject = reject;
    let settled = false;
    const isSettled = () => settled;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (activeWorker === worker) {
        activeWorker = null;
        activeReject = null;
      }
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "progress"; ratio: number; label: string }
        | ({ type: "done" } & ExportResult)
        | { type: "error"; message: string };

      if (data.type === "progress") {
        onProgress({ ratio: data.ratio, label: data.label });
        return;
      }
      if (data.type === "error") {
        finish();
        reject(new Error(data.message));
        return;
      }
      if (data.type === "done") {
        void (async () => {
          try {
            let bytes = new Uint8Array(data.buffer);
            if (bytes.byteLength > MAX_GIF_BYTES) {
              bytes = await squeezeToCap(bytes, MAX_GIF_BYTES, onProgress);
            }
            if (bytes.byteLength < MAX_GIF_BYTES) bytes = exactBytes(bytes, MAX_GIF_BYTES);
            if (bytes.byteLength > MAX_GIF_BYTES) throw new Error("Export came out over 14.9 MB.");
            const copy = new Uint8Array(bytes.byteLength);
            copy.set(bytes);
            finish();
            resolve({ ...data, buffer: copy.buffer, bytes: copy.byteLength });
          } catch (error) {
            finish();
            reject(error instanceof Error ? error : new Error("Export failed."));
          }
        })();
        return;
      }
    };

    worker.onerror = () => {
      finish();
      reject(new Error("Export failed. Try a shorter GIF."));
    };

    void send(worker, isSettled).catch(() => {
      finish();
      reject(new Error("Couldn't read that file."));
    });
  });
}
