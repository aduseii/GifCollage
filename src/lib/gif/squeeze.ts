import gifsicle from "gifsicle-wasm-browser";

type Step = { optimize: 1 | 2; lossy?: number; colors?: number };

/** EZGIF order: lossless optimize, then lossy LZW, then fewer colors. Never scales. */
const STEPS: Step[] = [
  { optimize: 2 },
  { optimize: 2, lossy: 20 },
  { optimize: 2, lossy: 35 },
  { optimize: 2, lossy: 50 },
  { optimize: 2, lossy: 70 },
  { optimize: 2, lossy: 90 },
  { optimize: 2, lossy: 120 },
  { optimize: 2, lossy: 160 },
  { optimize: 2, lossy: 80, colors: 128 },
  { optimize: 2, lossy: 110, colors: 96 },
  { optimize: 2, lossy: 140, colors: 64 },
  { optimize: 1, lossy: 180, colors: 48 },
];

function gifSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 10) return null;
  const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!);
  if (sig !== "GIF87a" && sig !== "GIF89a") return null;
  return { width: bytes[6]! | (bytes[7]! << 8), height: bytes[8]! | (bytes[9]! << 8) };
}

function stepLabel(step: Step): string {
  if (!step.lossy && !step.colors) return "Optimizing frames, same size";
  if (step.colors) return `Lossy ${step.lossy}, ${step.colors} colors, same size`;
  return `Lossy ${step.lossy}, same size`;
}

async function runStep(input: Uint8Array, step: Step): Promise<Uint8Array<ArrayBuffer>> {
  const flags = [`-O${step.optimize}`];
  if (step.lossy) flags.push(`--lossy=${step.lossy}`);
  if (step.colors) flags.push(`--colors ${step.colors}`);
  flags.push("in.gif -o /out/out.gif");
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const file = new File([copy], "in.gif", { type: "image/gif" });
  const files = await gifsicle.run({
    input: [{ file, name: "in.gif" }],
    command: [flags.join(" ")],
  });
  const outFile = files?.[0];
  if (!outFile) throw new Error("Optimizer failed.");
  const raw = new Uint8Array(await outFile.arrayBuffer());
  const packed = new Uint8Array(raw.byteLength);
  packed.set(raw);
  return packed;
}

/** Shrink the file the way EZGIF does, without changing width or height. */
export async function squeezeToCap(
  input: Uint8Array,
  cap: number,
  onProgress: (progress: { ratio: number; label: string }) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (input.byteLength <= cap) {
    const same = new Uint8Array(input.byteLength);
    same.set(input);
    return same;
  }
  const before = gifSize(input);
  let best = new Uint8Array(input.byteLength);
  best.set(input);
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]!;
    onProgress({ ratio: 0.52 + (i / STEPS.length) * 0.42, label: stepLabel(step) });
    const out = await runStep(input, step);
    const after = gifSize(out);
    if (before && after && (after.width !== before.width || after.height !== before.height)) {
      throw new Error("Optimizer changed the picture size. Stopped.");
    }
    if (out.byteLength < best.byteLength) best = out;
    if (out.byteLength <= cap) return out;
  }
  if (best.byteLength <= cap) return best;
  throw new Error("Couldn't fit this GIF under 14.9 MB without shrinking it.");
}
