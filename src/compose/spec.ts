/**
 * The dashboard spec: a fully declarative document. The viewer renders it
 * without any knowledge of Jev, the catalog or the query engine; every chart
 * is a self-contained Vega-Lite spec with its data inlined.
 */
import type { TileSize } from "../catalog/components.js";
import type { Grain, TimeWindow } from "../catalog/semantic.js";
import type { PresentationOptions, ThemePreset } from "../catalog/themes.js";
import type { DecisionRecord, StageTrace, TileRole } from "../decisions/plan.js";
import type { QueryRequest, Row } from "../data/query.js";

export interface Placement {
  colStart: number; // 1-based
  colSpan: number;
  rowStart: number; // 1-based
  rowSpan: number;
}

export interface KpiPayload {
  value: number | null;
  prior: number | null;
  delta: number | null; // value - prior
  deltaPct: number | null;
  format: "currency" | "number" | "percent" | "days";
  goodDirection: "up" | "down";
  spark: { period: string; value: number | null }[];
}

export interface TablePayload {
  columns: { key: string; label: string; format?: "currency" | "number" | "percent" | "days" }[];
  rows: Row[];
}

export interface TileSpec {
  id: string;
  role: TileRole;
  component: string;
  title: string;
  size: TileSize;
  placement: Placement;
  importance: number;
  confidence: number;
  query: QueryRequest;
  cube: string;
  rowCount: number;
  /** exactly one of the payloads is set, by component kind */
  kpi?: KpiPayload;
  vegaLite?: Record<string, unknown>;
  table?: TablePayload;
  /** the tile's rows, so the viewer can offer a table view of every chart */
  data: Row[];
}

export interface DashboardSpec {
  version: "0.1";
  title: string;
  subtitle: string;
  generatedAt: string;
  request: string;
  source: { connector: string; dataset: string; asOf: string; snapshotSource: string; cubes: string[] };
  theme: ThemePreset;
  layout: { template: string; columns: 12; rowHeightPx: number; gapPx: number };
  filters: { window: TimeWindow; start: string; end: string; grain: Grain; comparePrior: boolean };
  presentation: PresentationOptions;
  tiles: TileSpec[];
  decisions: { client: string; stages: StageTrace[]; summary: DecisionRecord[] };
}
