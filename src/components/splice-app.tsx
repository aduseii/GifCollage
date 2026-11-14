import { useState } from "react";
import { clsx } from "clsx";
import { Crop, LayoutGrid, Shrink, Type } from "lucide-react";
import { CollageTool } from "./collage-tool";
import { CompressTool } from "./compress-tool";
import { CropTool } from "./crop-tool";
import { TextTool } from "./text-tool";

type Tool = "collage" | "text" | "crop" | "compress";

const TOOLS: Array<{ id: Tool; label: string; blurb: string; icon: typeof Type }> = [
  { id: "collage", label: "Collage", blurb: "Grids and mosaics, locked at 14.9 MB.", icon: LayoutGrid },
  { id: "text", label: "Text", blurb: "Drag captions and iOS emoji. Export locks at 14.9 MB.", icon: Type },
  { id: "crop", label: "Crop", blurb: "Trim the frame. Export locks at 14.9 MB.", icon: Crop },
  { id: "compress", label: "Compress", blurb: "EZGIF-style optimize. The picture is not resized.", icon: Shrink },
];

export function SpliceApp() {
  const [tool, setTool] = useState<Tool>("collage");
  const current = TOOLS.find((item) => item.id === tool) ?? TOOLS[0]!;

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.22em] text-amber uppercase">GIF bench</p>
            <h1 className="font-display text-4xl leading-none font-semibold tracking-tight sm:text-5xl">Splice</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">{current.blurb}</p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block font-display text-3xl leading-none font-semibold text-amber">14.9</span>
            <span className="text-[11px] font-medium tracking-[0.18em] text-muted uppercase">MB lock</span>
          </p>
        </header>

        <nav className="grid grid-cols-4 border-b border-line" aria-label="Tools">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const active = item.id === tool;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTool(item.id)}
                className={clsx(
                  "inline-flex h-12 items-center justify-center gap-1.5 border-b-2 px-1 text-sm font-medium",
                  active ? "border-amber text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {tool === "collage" ? <CollageTool /> : null}
        {tool === "text" ? <TextTool /> : null}
        {tool === "crop" ? <CropTool /> : null}
        {tool === "compress" ? <CompressTool /> : null}
      </div>
    </main>
  );
}
