export type Count = 2 | 4 | 6 | 8;

export type CellSpan = { c: number; r: number; w: number; h: number };

export type Layout = {
  id: string;
  label: string;
  count: Count;
  cols: number;
  rows: number;
  cells: CellSpan[];
};

function uniform(cols: number, rows: number): CellSpan[] {
  const cells: CellSpan[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ c, r, w: 1, h: 1 });
  }
  return cells;
}

export const LAYOUTS: Layout[] = [
  { id: "wide", label: "Wide", count: 2, cols: 2, rows: 1, cells: uniform(2, 1) },
  { id: "tall", label: "Tall", count: 2, cols: 1, rows: 2, cells: uniform(1, 2) },

  { id: "grid", label: "Grid", count: 4, cols: 2, rows: 2, cells: uniform(2, 2) },
  { id: "row", label: "Row", count: 4, cols: 4, rows: 1, cells: uniform(4, 1) },
  {
    id: "hero",
    label: "Hero",
    count: 4,
    cols: 3,
    rows: 2,
    cells: [
      { c: 0, r: 0, w: 3, h: 1 },
      { c: 0, r: 1, w: 1, h: 1 },
      { c: 1, r: 1, w: 1, h: 1 },
      { c: 2, r: 1, w: 1, h: 1 },
    ],
  },
  {
    id: "rail",
    label: "Rail",
    count: 4,
    cols: 2,
    rows: 3,
    cells: [
      { c: 0, r: 0, w: 1, h: 3 },
      { c: 1, r: 0, w: 1, h: 1 },
      { c: 1, r: 1, w: 1, h: 1 },
      { c: 1, r: 2, w: 1, h: 1 },
    ],
  },

  { id: "grid", label: "Grid", count: 6, cols: 3, rows: 2, cells: uniform(3, 2) },
  { id: "stack", label: "Stack", count: 6, cols: 2, rows: 3, cells: uniform(2, 3) },
  {
    id: "hero",
    label: "Hero",
    count: 6,
    cols: 3,
    rows: 3,
    cells: [
      { c: 0, r: 0, w: 2, h: 2 },
      { c: 2, r: 0, w: 1, h: 1 },
      { c: 2, r: 1, w: 1, h: 1 },
      { c: 0, r: 2, w: 1, h: 1 },
      { c: 1, r: 2, w: 1, h: 1 },
      { c: 2, r: 2, w: 1, h: 1 },
    ],
  },
  {
    id: "band",
    label: "Band",
    count: 6,
    cols: 4,
    rows: 2,
    cells: [
      { c: 0, r: 0, w: 2, h: 1 },
      { c: 2, r: 0, w: 2, h: 1 },
      { c: 0, r: 1, w: 1, h: 1 },
      { c: 1, r: 1, w: 1, h: 1 },
      { c: 2, r: 1, w: 1, h: 1 },
      { c: 3, r: 1, w: 1, h: 1 },
    ],
  },

  { id: "grid", label: "Grid", count: 8, cols: 4, rows: 2, cells: uniform(4, 2) },
  { id: "stack", label: "Stack", count: 8, cols: 2, rows: 4, cells: uniform(2, 4) },
  {
    id: "hero",
    label: "Hero",
    count: 8,
    cols: 4,
    rows: 3,
    cells: [
      { c: 0, r: 0, w: 2, h: 2 },
      { c: 2, r: 0, w: 1, h: 1 },
      { c: 3, r: 0, w: 1, h: 1 },
      { c: 2, r: 1, w: 1, h: 1 },
      { c: 3, r: 1, w: 1, h: 1 },
      { c: 0, r: 2, w: 1, h: 1 },
      { c: 1, r: 2, w: 1, h: 1 },
      { c: 2, r: 2, w: 2, h: 1 },
    ],
  },
  {
    id: "pairs",
    label: "Pairs",
    count: 8,
    cols: 4,
    rows: 3,
    cells: [
      { c: 0, r: 0, w: 2, h: 1 },
      { c: 2, r: 0, w: 2, h: 1 },
      { c: 0, r: 1, w: 2, h: 1 },
      { c: 2, r: 1, w: 2, h: 1 },
      { c: 0, r: 2, w: 1, h: 1 },
      { c: 1, r: 2, w: 1, h: 1 },
      { c: 2, r: 2, w: 1, h: 1 },
      { c: 3, r: 2, w: 1, h: 1 },
    ],
  },
];

export function layoutsFor(count: Count): Layout[] {
  return LAYOUTS.filter((layout) => layout.count === count);
}

export function layoutById(count: Count, id: string): Layout {
  const list = layoutsFor(count);
  return list.find((layout) => layout.id === id) ?? list[0]!;
}
