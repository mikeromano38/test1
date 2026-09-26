/**
 * Turns a Plan (Jev's decisions) into a DashboardSpec by running the tile
 * queries against the snapshot store and instantiating the component
 * templates. No decisions are made here that Jev could have made; only the
 * mechanical consequences of the plan.
 */
import { componentById } from "../catalog/components.js";
import { GRAIN_ORDER, dimensionById, metricById, type Dimension, type Grain, type Metric } from "../catalog/semantic.js";
import { themeById } from "../catalog/themes.js";
import type { Plan, PlannedTile } from "../decisions/plan.js";
import { SnapshotStore, type QueryRequest, type Row } from "../data/query.js";
import { TemplateParameterGenerator, type ParameterGenerator } from "../params/generator.js";
import { ROW_HEIGHT, TOP_N, packTiles } from "./layout.js";
import type { DashboardSpec, KpiPayload, TablePayload, TileSpec } from "./spec.js";
import { buildVegaLite } from "./vegalite.js";

const NATURAL_ORDER: Record<string, string[]> = {
  age_band: ["Under 25", "25-34", "35-44", "45-54", "55+"],
  event_type: ["home", "department", "product", "cart", "purchase", "cancel"],
  order_status: ["Processing", "Shipped", "Complete", "Returned", "Cancelled"],
};

export interface ComposeOptions {
  store: SnapshotStore;
  params?: ParameterGenerator;
}

export async function composeDashboard(plan: Plan, opts: ComposeOptions): Promise<DashboardSpec> {
  const { store } = opts;
  const params = opts.params ?? new TemplateParameterGenerator();
  const theme = themeById(plan.presentation.theme);
  const window = store.resolveWindow(plan.scope.timeWindow);
  const packed = packTiles(plan.tiles, plan.presentation.layout, theme.density);
  const cubes = new Set<string>();
  const tiles: TileSpec[] = [];

  for (const { tile, size, placement } of packed) {
    const built = buildTile(plan, tile, store, theme.id, placement.rowSpan, placement.colSpan);
    cubes.add(built.cube);
    tiles.push({ ...built, title: await params.tileTitle(plan, tile), size, placement });
  }

  const { title, subtitle } = await params.dashboardTitle(plan);
  return {
    version: "0.1",
    title,
    subtitle,
    generatedAt: new Date().toISOString(),
    request: plan.request,
    source: { connector: plan.presentation.connector, dataset: store.manifest.dataset, asOf: store.manifest.asOf, snapshotSource: store.manifest.source, cubes: [...cubes] },
    theme,
    layout: { template: plan.presentation.layout, columns: 12, rowHeightPx: ROW_HEIGHT[theme.density], gapPx: theme.density === "compact" ? 10 : theme.density === "spacious" ? 20 : 14 },
    filters: { window: plan.scope.timeWindow, start: window.start, end: window.end, grain: plan.scope.grain, comparePrior: plan.scope.comparePrior },
    presentation: {
      numberFormat: plan.presentation.numberFormat,
      gridlines: plan.presentation.gridlines,
      directLabels: plan.presentation.directLabels,
      sortBreakdowns: plan.presentation.sortBreakdowns,
    },
    tiles,
    decisions: { client: plan.trace[0]?.client ?? "unknown", stages: plan.trace, summary: plan.trace.flatMap((t) => t.decisions) },
  };
}

type BuiltTile = Omit<TileSpec, "title" | "size" | "placement">;

function buildTile(plan: Plan, tile: PlannedTile, store: SnapshotStore, themeId: string, rowSpan: number, colSpan: number): BuiltTile {
  const component = componentById(tile.component);
  const metrics = tile.metrics.map(metricById);
  const dims = tile.dimensions.map(dimensionById);
  const theme = themeById(themeId);
  const rowH = ROW_HEIGHT[theme.density];
  const gap = theme.density === "compact" ? 10 : theme.density === "spacious" ? 20 : 14;
  // tile padding (24) + header (~30) + vega padding/axis band (~50)
  const chartHeight = Math.max(100, rowSpan * rowH + (rowSpan - 1) * gap - 104);
  const base = { id: tile.id, role: tile.role, component: tile.component, importance: tile.importance, confidence: tile.confidence };

  if (component.kind === "kpi") {
    const { kpi, query, cube, rows } = buildKpi(plan, metrics[0], store);
    return { ...base, query, cube, rowCount: rows.length, kpi, data: rows };
  }

  const topN = TOP_N[component.id];
  const grain = tile.hasTime ? effectiveGrain(store, tile.metrics, tile.dimensions, plan.scope.grain) : undefined;
  const query: QueryRequest = {
    metrics: tile.metrics,
    dimensions: tile.dimensions,
    grain,
    window: plan.scope.timeWindow,
    ...(topN && dims[0] && dims[0].id !== "state" ? { topN } : {}),
  };
  const { cube, rows } = store.query(query);

  if (component.kind === "table") {
    const table: TablePayload = {
      columns: [...dims.map((d) => ({ key: d.id, label: d.label })), ...metrics.map((m) => ({ key: m.id, label: m.label, format: m.format }))],
      rows: sortRows(rows, dims[0], metrics[0], plan.presentation.sortBreakdowns),
    };
    return { ...base, query, cube, rowCount: rows.length, table, data: rows };
  }

  const categoryOrder = dims[0] ? categoryOrderFor(rows, dims[0], metrics[0], plan.presentation.sortBreakdowns, component.colorJob === "categorical") : undefined;
  const vegaLite = buildVegaLite({
    component: component.id,
    metric: metrics[0],
    dimension: dims[0],
    grain: grain ?? plan.scope.grain,
    rows,
    theme,
    presentation: plan.presentation,
    height: chartHeight,
    widthHint: Math.round((colSpan / 12) * 1200) - 60,
    categoryOrder,
  });
  return { ...base, query, cube, rowCount: rows.length, vegaLite, data: rows };
}

function buildKpi(plan: Plan, metric: Metric, store: SnapshotStore): { kpi: KpiPayload; query: QueryRequest; cube: string; rows: Row[] } {
  const query: QueryRequest = { metrics: [metric.id], dimensions: [], window: plan.scope.timeWindow };
  const cur = store.query(query);
  const value = (cur.rows[0]?.[metric.id] as number | null) ?? null;
  let prior: number | null = null;
  if (plan.scope.comparePrior) {
    const p = store.query({ ...query, window: store.priorWindow(plan.scope.timeWindow) });
    prior = (p.rows[0]?.[metric.id] as number | null) ?? null;
  }
  const sparkGrain = effectiveGrain(store, [metric.id], [], plan.scope.grain === "quarter" ? "month" : plan.scope.grain);
  const spark = store.query({ ...query, grain: sparkGrain }).rows.map((r) => ({ period: String(r.period), value: (r[metric.id] as number | null) ?? null }));
  const delta = value !== null && prior !== null ? value - prior : null;
  const deltaPct = delta !== null && prior ? delta / prior : null;
  return { kpi: { value, prior, delta, deltaPct, format: metric.format, goodDirection: metric.goodDirection, spark }, query, cube: cur.cube, rows: cur.rows };
}

/** The requested grain, coarsened to the finest grain the metric's cubes can serve (monthly-only metrics never get a daily chart). */
function effectiveGrain(store: SnapshotStore, metrics: string[], dimensions: string[], requested: Grain): Grain {
  const finest = store.finestGrain(metrics, dimensions);
  if (!finest) throw new Error(`No cube can serve ${metrics.join(",")} by ${dimensions.join(",") || "(none)"} at any grain`);
  return GRAIN_ORDER[finest] > GRAIN_ORDER[requested] ? finest : requested;
}

/**
 * Categorical colour follows the entity: the order is fixed by total value
 * over the window (or the natural order for ordered dimensions), and the same
 * order is used for the legend, the stack and the colour scale.
 */
function categoryOrderFor(rows: Row[], dim: Dimension, metric: Metric, sort: "by_value" | "natural", _categorical: boolean): string[] {
  const natural = NATURAL_ORDER[dim.id];
  const present = new Set(rows.map((r) => String(r[dim.id])));
  if (dim.ordered && natural) return natural.filter((v) => present.has(v));
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(String(r[dim.id]), (totals.get(String(r[dim.id])) ?? 0) + Number(r[metric.id] ?? 0));
  const keys = [...totals.keys()];
  if (sort === "natural") return keys.sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  return keys.sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : totals.get(b)! - totals.get(a)!));
}

function sortRows(rows: Row[], dim: Dimension | undefined, metric: Metric, sort: "by_value" | "natural"): Row[] {
  if (!dim) return rows;
  const order = categoryOrderFor(rows, dim, metric, sort, false);
  const idx = new Map(order.map((k, i) => [k, i]));
  return [...rows].sort((a, b) => (idx.get(String(a[dim.id])) ?? 0) - (idx.get(String(b[dim.id])) ?? 0));
}
