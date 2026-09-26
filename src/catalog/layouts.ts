import type { TileSize } from "./components.js";

/**
 * Layout templates. A template is a set of *rules* the packer applies to the
 * tile list; the packer itself is code (Jev is not asked to place tiles on a
 * grid, only to pick which template fits the request).
 */
export interface LayoutTemplate {
  id: string;
  label: string;
  description: string; // what Jev reads
  columns: 12;
  /** where stat tiles go */
  kpiPlacement: "top_row" | "left_column" | "inline";
  /** override chart sizes to keep the template's rhythm; undefined keeps Jev's per-tile size */
  chartSize?: TileSize;
  /** the most important chart is promoted to this size */
  heroSize?: TileSize;
  maxTiles: number;
}

export const LAYOUTS: LayoutTemplate[] = [
  { id: "kpi_row_grid", label: "KPI row + grid", description: "Headline stat tiles across the top, then charts packed into a grid below. The conventional overview dashboard.", columns: 12, kpiPlacement: "top_row", heroSize: "xl", maxTiles: 12 },
  { id: "hero_focus", label: "Hero focus", description: "One large main chart with stat tiles down the left side and a few small supporting charts. When one trend is the whole story.", columns: 12, kpiPlacement: "left_column", heroSize: "full", chartSize: "md", maxTiles: 8 },
  { id: "two_column", label: "Two columns", description: "Every chart at half width in two even columns, stat tiles inline. Balanced comparison of several equally important views.", columns: 12, kpiPlacement: "top_row", chartSize: "lg", maxTiles: 10 },
  { id: "narrative", label: "Single column narrative", description: "Full-width tiles stacked in reading order, one idea per screen height. For a report that is read top to bottom rather than scanned.", columns: 12, kpiPlacement: "inline", chartSize: "full", maxTiles: 7 },
];

export const layoutById = (id: string): LayoutTemplate => {
  const l = LAYOUTS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown layout ${id}`);
  return l;
};
