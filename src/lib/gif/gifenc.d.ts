declare module "gifenc" {
  export type RGB = number[];

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444" },
  ): RGB[];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: RGB[],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: RGB[] | null; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
