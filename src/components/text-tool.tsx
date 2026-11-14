import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clsx } from "clsx";
import { exportSingle } from "@/lib/gif/export-client";
import { MAX_GIF_BYTES } from "@/lib/gif/limits";
import { TEXT_COLORS, TEXT_SIZES, renderTextOverlay, type TextPlate, type TextSize, type TextTone } from "@/lib/gif/overlay";
import { EMOJI_GROUPS, appleEmojiCandidates, isEmojiGrapheme, splitGlyphs } from "@/lib/emoji-ios";
import { ACCEPT, Chip, Choice, ExportBar, ResultCard, useToolResult } from "./tool-bits";

const SIZES: Array<{ id: TextSize; label: string }> = [
  { id: "s", label: "Small" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Large" },
];

const EMOJI_SCALES: Record<TextSize, number> = { s: 0.1, m: 0.16, l: 0.24 };

const TONES: Array<{ id: TextTone; label: string }> = [
  { id: "white", label: "White" },
  { id: "black", label: "Black" },
  { id: "blue", label: "Blue" },
];

const PLATES: Array<{ id: TextPlate; label: string }> = [
  { id: "none", label: "Shadow" },
  { id: "dark", label: "Dark plate" },
  { id: "light", label: "Light plate" },
];

type Sticker = { id: number; glyph: string; x: number; y: number; scale: number };

export function TextTool() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [size, setSize] = useState<TextSize>("m");
  const [emojiSize, setEmojiSize] = useState<TextSize>("m");
  const [tone, setTone] = useState<TextTone>("white");
  const [plate, setPlate] = useState<TextPlate>("dark");
  const [bold, setBold] = useState(true);
  const [pos, setPos] = useState({ x: 0.5, y: 0.78 });
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selected, setSelected] = useState<number | "text" | null>(null);
  const [group, setGroup] = useState(EMOJI_GROUPS[0]?.id ?? "faces");
  const [ghost, setGhost] = useState<{ glyph: string; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ ratio: number; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { result, remember } = useToolResult();
  const frameRef = useRef<HTMLDivElement>(null);
  const jobRef = useRef(0);
  const nextId = useRef(1);

  function take(next: File | null) {
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
    remember(null);
    setError(null);
  }

  function placeEmoji(glyph: string, at?: { x: number; y: number }) {
    const id = nextId.current++;
    const scale = EMOJI_SCALES[emojiSize];
    setStickers((list) => {
      const n = list.length;
      const x = at ? clamp(at.x) : clamp(0.5 + ((n % 3) - 1) * 0.14);
      const y = at ? clamp(at.y) : clamp(0.46 + (Math.floor(n / 3) % 3 - 1) * 0.12);
      return [...list, { id, glyph, x, y, scale }];
    });
    setSelected(id);
    remember(null);
  }

  function onCaption(value: string) {
    const parts = splitGlyphs(value);
    let plain = "";
    const dropped: string[] = [];
    for (const part of parts) {
      if (isEmojiGrapheme(part)) dropped.push(part);
      else plain += part;
    }
    setText(plain);
    remember(null);
    if (!file && dropped.length > 0) {
      setError("Add a GIF first, then drag emoji onto it.");
      return;
    }
    for (const glyph of dropped) placeEmoji(glyph);
  }

  function onEmojiPointerDown(event: ReactPointerEvent<HTMLButtonElement>, glyph: string) {
    if (!file) {
      setError("Add a GIF first, then drag emoji onto it.");
      return;
    }
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        moved = true;
        setGhost({ glyph, x: ev.clientX, y: ev.clientY });
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      setGhost(null);
      const box = frameRef.current?.getBoundingClientRect();
      const over =
        !!box && ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom;
      if (over && box && box.width > 0 && box.height > 0) {
        placeEmoji(glyph, { x: (ev.clientX - box.left) / box.width, y: (ev.clientY - box.top) / box.height });
        return;
      }
      if (!moved) placeEmoji(glyph);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function dragPlaced(
    event: ReactPointerEvent,
    current: { x: number; y: number },
    apply: (x: number, y: number) => void,
  ) {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    remember(null);
    const node = event.currentTarget as HTMLElement;
    node.setPointerCapture(event.pointerId);
    const dx = event.clientX - (box.left + current.x * box.width);
    const dy = event.clientY - (box.top + current.y * box.height);
    const move = (ev: PointerEvent) => {
      const b = frameRef.current?.getBoundingClientRect();
      if (!b || b.width === 0 || b.height === 0) return;
      apply(clamp((ev.clientX - dx - b.left) / b.width), clamp((ev.clientY - dy - b.top) / b.height));
    };
    const end = () => node.removeEventListener("pointermove", move);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end, { once: true });
    node.addEventListener("pointercancel", end, { once: true });
  }

  function setStickerScale(next: TextSize) {
    setEmojiSize(next);
    if (typeof selected === "number") {
      const scale = EMOJI_SCALES[next];
      setStickers((list) => list.map((item) => (item.id === selected ? { ...item, scale } : item)));
    }
    remember(null);
  }

  async function onExport() {
    if (!file || busy) return;
    if (!text.trim() && stickers.length === 0) return;
    const job = ++jobRef.current;
    setBusy(true);
    setError(null);
    setProgress({ ratio: 0.04, label: "Drawing caption" });
    try {
      const probe = await createImageBitmap(file);
      const width = probe.width % 2 === 0 ? probe.width : probe.width - 1;
      const height = probe.height % 2 === 0 ? probe.height : probe.height - 1;
      probe.close();
      const overlay = await renderTextOverlay(
        Math.max(2, width),
        Math.max(2, height),
        text,
        { nx: pos.x, ny: pos.y, size, tone, plate, bold },
        stickers.map((item) => ({ glyph: item.glyph, nx: item.x, ny: item.y, scale: item.scale })),
      );
      if (jobRef.current !== job) {
        overlay.close();
        return;
      }
      const exported = await exportSingle({
        op: "text",
        file,
        overlay,
        onProgress: (next) => {
          if (jobRef.current === job) setProgress(next);
        },
      });
      if (jobRef.current !== job) return;
      if (exported.bytes > MAX_GIF_BYTES) throw new Error("Export came out over 14.9 MB.");
      const blob = new Blob([exported.buffer], { type: "image/gif" });
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

  const active = EMOJI_GROUPS.find((item) => item.id === group) ?? EMOJI_GROUPS[0];
  const glyphs = active ? splitGlyphs(active.glyphs) : [];
  const ready = !!file && (text.trim().length > 0 || stickers.length > 0) && !busy;

  return (
    <>
      <div className="flex flex-col gap-4 pb-40">
        <section className="rounded-lg border border-line bg-surface p-3 sm:p-4" aria-label="Caption">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Caption</span>
              <textarea
                value={text}
                rows={2}
                maxLength={180}
                placeholder="Type a caption, then drag it on the GIF"
                onChange={(event) => onCaption(event.target.value)}
                className="min-h-20 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-base text-ink outline-none focus:border-amber"
              />
            </label>
            <div className="rounded-lg border border-line bg-canvas">
              <div className="flex items-center justify-between gap-3 px-2 pt-2">
                <p className="text-xs font-medium tracking-wide text-muted uppercase">iOS emoji</p>
                {typeof selected === "number" ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-amber"
                    onClick={() => {
                      setStickers((list) => list.filter((item) => item.id !== selected));
                      setSelected(null);
                      remember(null);
                    }}
                  >
                    Remove selected
                  </button>
                ) : (
                  <p className="text-sm text-muted">Drag onto the GIF</p>
                )}
              </div>
              <div className="flex gap-1 overflow-x-auto p-1" aria-label="Emoji categories">
                {EMOJI_GROUPS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={item.id === group}
                    onClick={() => setGroup(item.id)}
                    className={clsx(
                      "inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm",
                      item.id === group ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface",
                    )}
                  >
                    <EmojiImg glyph={item.icon} size={64} className="size-5" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto px-1 pb-1">
                {glyphs.map((glyph, index) => (
                  <button
                    key={`${group}-${index}`}
                    type="button"
                    aria-label={`Place ${glyph}`}
                    onPointerDown={(event) => onEmojiPointerDown(event, glyph)}
                    className="inline-flex h-11 items-center justify-center rounded-md hover:bg-surface-2"
                  >
                    <EmojiImg glyph={glyph} size={64} className="size-7" />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Choice label="Text size">
                {SIZES.map((item) => (
                  <Chip key={item.id} active={size === item.id} onClick={() => { setSize(item.id); remember(null); }}>
                    {item.label}
                  </Chip>
                ))}
              </Choice>
              <Choice label="Emoji size">
                {SIZES.map((item) => (
                  <Chip key={item.id} active={emojiSize === item.id} onClick={() => setStickerScale(item.id)}>
                    {item.label}
                  </Chip>
                ))}
              </Choice>
              <Choice label="Color">
                {TONES.map((item) => (
                  <Chip key={item.id} active={tone === item.id} onClick={() => { setTone(item.id); remember(null); }}>
                    {item.label}
                  </Chip>
                ))}
              </Choice>
              <Choice label="Backing">
                {PLATES.map((item) => (
                  <Chip key={item.id} active={plate === item.id} onClick={() => { setPlate(item.id); remember(null); }}>
                    {item.label}
                  </Chip>
                ))}
              </Choice>
              <Choice label="Weight">
                <Chip active={!bold} onClick={() => { setBold(false); remember(null); }}>Regular</Chip>
                <Chip active={bold} onClick={() => { setBold(true); remember(null); }}>Bold</Chip>
              </Choice>
            </div>
          </div>
        </section>

        <section aria-label="Text preview">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Preview</h2>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-2">
              {file ? "Replace GIF" : "Add GIF"}
              <input
                id="text-gif"
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
            <div ref={frameRef} className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg bg-mat-black">
              <img src={url} alt="" draggable={false} className="mx-auto block max-h-[48dvh] w-auto max-w-full" />
              <div
                className="absolute inset-0"
                style={{ containerType: "inline-size" }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setSelected(null);
                }}
              >
              {text.trim() ? (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Drag caption"
                  className={clsx(
                    "absolute z-10 max-w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none text-center leading-tight select-none active:cursor-grabbing",
                    plate === "dark" && "rounded-md bg-canvas/80 px-[0.6em] py-[0.3em]",
                    plate === "light" && "rounded-md bg-mat-paper px-[0.6em] py-[0.3em]",
                    selected === "text" && "ring-2 ring-amber",
                  )}
                  style={{
                    left: `${pos.x * 100}%`,
                    top: `${pos.y * 100}%`,
                    fontSize: `${TEXT_SIZES[size] * 100}cqi`,
                    fontWeight: bold ? 700 : 500,
                    color: plate === "light" && tone === "white" ? TEXT_COLORS.black : TEXT_COLORS[tone],
                    textShadow:
                      plate === "none"
                        ? tone === "black"
                          ? "0 1px 2px rgba(255,255,255,0.9)"
                          : "0 2px 10px rgba(0,0,0,0.85)"
                        : undefined,
                  }}
                  onPointerDown={(event) => {
                    setSelected("text");
                    dragPlaced(event, pos, (x, y) => setPos({ x, y }));
                  }}
                >
                  {text}
                </div>
              ) : null}
              {stickers.map((sticker) => (
                <div
                  key={sticker.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Drag emoji ${sticker.glyph}`}
                  className={clsx(
                    "absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing",
                    selected === sticker.id && "z-30 rounded-md ring-2 ring-amber",
                  )}
                  style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: `${sticker.scale * 100}cqi` }}
                  onPointerDown={(event) => {
                    setSelected(sticker.id);
                    dragPlaced(event, sticker, (x, y) => {
                      setStickers((list) => list.map((item) => (item.id === sticker.id ? { ...item, x, y } : item)));
                    });
                  }}
                >
                  <EmojiImg glyph={sticker.glyph} size={160} className="pointer-events-none h-auto w-full" />
                  {selected === sticker.id ? (
                    <button
                      type="button"
                      aria-label="Remove emoji"
                      className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-line bg-canvas text-sm text-ink"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setStickers((list) => list.filter((item) => item.id !== sticker.id));
                        setSelected(null);
                        remember(null);
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {!text.trim() && stickers.length === 0 ? (
                <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-muted">
                  Drag a caption or an emoji onto the GIF.
                </p>
              ) : null}
              </div>
            </div>
          ) : (
            <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface text-muted hover:text-ink">
              Drop a GIF here
              <input
                id="text-drop"
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
          <p className="mt-2 text-sm text-muted">
            Emoji are Apple's iOS pictures, not your phone's font. Drag the caption and each emoji to the spot you want.
          </p>
        </section>

        {result ? (
          <ResultCard
            result={result}
            before={file?.size}
            downloadName="splice-caption.gif"
            note="Burned in with the same 14.9 MB collage export."
          />
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-amber">
            {error}
          </p>
        ) : null}
      </div>
      {ghost ? (
        <div
          className="pointer-events-none fixed z-50 w-16 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <EmojiImg glyph={ghost.glyph} size={160} className="h-auto w-full" />
        </div>
      ) : null}
      <ExportBar
        busy={busy}
        progress={progress}
        hint={file ? "Drag the caption and emoji into place, then burn them in." : "Add a GIF to caption it."}
        ready={ready}
        action="Burn onto GIF"
        downloadName="splice-caption.gif"
        result={result}
        onRun={() => void onExport()}
      />
    </>
  );
}

function EmojiImg({ glyph, size, className }: { glyph: string; size: 64 | 160; className?: string }) {
  const candidates = appleEmojiCandidates(glyph, size);
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={className}
      onError={() => {
        if (index < candidates.length - 1) setIndex(index + 1);
      }}
    />
  );
}

function clamp(n: number): number {
  return Math.min(0.96, Math.max(0.04, n));
}
