import { SIZE_COLS, componentById, type TileSize } from "../catalog/components.js";
import { layoutById } from "../catalog/layouts.js";
import { dimensionById } from "../catalog/semantic.js";
import type { Density } from "../catalog/themes.js";
import type { PlannedTile } from "../decisions/plan.js";
import type { Placement } from "./spec.js";

export const ROW_HEIGHT: Record<Density, number> = { compact: 96, comfortable: 112, spacious: 132 };

/** Rows to show for step-sized charts: the category count after the composer's top-N fold. */
export const TOP_N: Record<string, number> = { bar_ranked: 15, donut: 5, multi_line: 6, stacked_bar_time: 6, small_multiples: 12, heatmap: 30 };

/**
 * Grid rows a tile occupies. Charts whose height grows with the number of
 * categories (ranked bars, heatmap, small multiples) size themselves from the
 * dimension's cardinality so the axis band is never clipped.
 */
export function rowUnits(component: string, size: TileSize, dimensions: string[] = [], density: Density = "comfortable"): number {
  const c = componentById(component);
  if (c.kind === "kpi") return 1;
  const rowH = ROW_HEIGHT[density] + 14;
  const n = dimensions[0] ? Math.min(dimensionById(dimensions[0]).cardinality, TOP_N[c.id] ?? 99) : 0;
  const units = (px: number) => Math.max(3, Math.ceil(px / rowH));
  if (c.id === "heatmap") return units(n * 22 + 150);
  if (c.id === "bar_ranked") return units(n * 28 + 120);
  if (c.id === "small_multiples") return units(Math.ceil(n / 4) * 130 + 110);
  if (c.kind === "map") return 4;
  return size === "full" ? 4 : 3;
}

/**
 * First-fit packer over a 12-column occupancy grid. The layout template only
 * decides the order in which tiles are offered to the packer and their sizes.
 */
export function packTiles(tiles: PlannedTile[], layoutId: string, density: Density = "comfortable"): { tile: PlannedTile; size: TileSize; placement: Placement }[] {
  const layout = layoutById(layoutId);
  const kpis = tiles.filter((t) => t.role === "kpi");
  const charts = tiles.filter((t) => t.role !== "kpi").sort((a, b) => b.importance - a.importance);

  const sized: { tile: PlannedTile; size: TileSize; rowSpan?: number }[] = [];
  const kpiSize: TileSize = kpis.length <= 2 ? "lg" : kpis.length === 3 ? "md" : "sm";
  const sizeFor = (t: PlannedTile, idx: number): TileSize => {
    const c = componentById(t.component);
    if (idx === 0 && layout.heroSize && c.allowedSizes.includes(layout.heroSize)) return layout.heroSize;
    if (layout.chartSize && c.allowedSizes.includes(layout.chartSize)) return layout.chartSize;
    return t.size;
  };

  if (layout.kpiPlacement === "left_column" && kpis.length && charts.length) {
    // kpi column on the left, hero to its right spanning the column's height, then the rest
    const heroRows = Math.max(3, kpis.length);
    sized.push({ tile: kpis[0], size: "sm" });
    sized.push({ tile: charts[0], size: "xl", rowSpan: heroRows });
    for (const k of kpis.slice(1)) sized.push({ tile: k, size: "sm" });
    for (let r = kpis.length; r < heroRows; r++) sized.push({ tile: { ...kpis[0], id: `_spacer_${r}` }, size: "sm" });
    charts.slice(1).forEach((c, i) => sized.push({ tile: c, size: sizeFor(c, i + 1) }));
  } else if (layout.kpiPlacement === "inline") {
    charts.forEach((c, i) => {
      if (i === 1) for (const k of kpis) sized.push({ tile: k, size: kpiSize });
      sized.push({ tile: c, size: sizeFor(c, i) });
    });
    if (charts.length < 2) for (const k of kpis) sized.push({ tile: k, size: kpiSize });
  } else {
    for (const k of kpis) sized.push({ tile: k, size: kpiSize });
    charts.forEach((c, i) => sized.push({ tile: c, size: sizeFor(c, i) }));
  }

  const grid: boolean[][] = [];
  const cell = (r: number, c: number) => (grid[r] ??= Array(12).fill(false))[c];
  const fits = (r: number, c: number, w: number, h: number) => {
    if (c + w > 12) return false;
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) if (cell(y, x)) return false;
    return true;
  };
  const fill = (r: number, c: number, w: number, h: number) => { for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) grid[y][x] = true; };

  const out: { tile: PlannedTile; size: TileSize; placement: Placement }[] = [];
  for (const s of sized) {
    const w = SIZE_COLS[s.size];
    const h = s.rowSpan ?? rowUnits(s.tile.component, s.size, s.tile.dimensions, density);
    let placed = false;
    for (let r = 0; !placed; r++) {
      for (let c = 0; c + w <= 12; c++) {
        if (fits(r, c, w, h)) { fill(r, c, w, h); out.push({ tile: s.tile, size: s.size, placement: { colStart: c + 1, colSpan: w, rowStart: r + 1, rowSpan: h } }); placed = true; break; }
      }
    }
  }
  // stretch the last tile of each row band to absorb leftover columns
  for (const p of out) {
    const { rowStart, colStart, colSpan, rowSpan } = p.placement;
    let extra = 0;
    for (let c = colStart - 1 + colSpan; c < 12; c++) {
      let free = true;
      for (let y = rowStart - 1; y < rowStart - 1 + rowSpan; y++) if (cell(y, c)) { free = false; break; }
      if (!free) break;
      extra++;
    }
    if (extra > 0 && extra <= 6) { fill(rowStart - 1, colStart - 1 + colSpan, extra, rowSpan); p.placement.colSpan += extra; }
  }
  return out.filter((p) => !p.tile.id.startsWith("_spacer_"));
}
