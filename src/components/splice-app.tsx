import { useState } from "react";
import { clsx } from "clsx";
import { Crop, LayoutGrid, Shrink, Type } from "lucide-react";
import { CollageTool } from "./collage-tool";
import { CompressTool } from "./compress-tool";
import { CropTool } from "./crop-tool";
import { TextTool } from "./text-tool";

type Tool = "collage" | "text" | "crop" | "compress";

const TOOLS: Array<{ id: Tool; label: string; blurb: string; icon: typeof Type }> = [
  { id: "collage", label: "Collage", blurb: "Combine 2 to 8 GIFs into one grid.", icon: LayoutGrid },
  { id: "text", label: "Text", blurb: "Add a caption or emoji to a GIF.", icon: Type },
  { id: "crop", label: "Crop", blurb: "Trim a GIF to the part that matters.", icon: Crop },
  { id: "compress", label: "Compress", blurb: "Get a GIF under 15 MB without resizing it.", icon: Shrink },
];

export function SpliceApp() {
  const [tool, setTool] = useState<Tool>("collage");
  const current = TOOLS.find((item) => item.id === tool) ?? TOOLS[0]!;

  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-col gap-4 border-b border-line pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl leading-none font-semibold tracking-tight">Splice</h1>
            <p className="truncate text-sm text-muted">{current.blurb}</p>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex flex-1 rounded-md border border-line bg-surface p-0.5 md:flex-none" aria-label="Tools">
              {TOOLS.map((item) => {
                const Icon = item.icon;
                const active = item.id === tool;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={item.label}
                    onClick={() => setTool(item.id)}
                    className={clsx(
                      "inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-[5px] px-3 text-sm font-medium transition-colors md:flex-none",
                      active ? "bg-surface-3 text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="hidden min-[420px]:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <p className="hidden shrink-0 text-xs text-muted lg:block">Every export stays under 15 MB</p>
          </div>
        </header>

        {tool === "collage" ? <CollageTool /> : null}
        {tool === "text" ? <TextTool /> : null}
        {tool === "crop" ? <CropTool /> : null}
        {tool === "compress" ? <CompressTool /> : null}
      </div>
    </main>
  );
}
