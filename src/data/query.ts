import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  CUBES,
  GRAIN_ORDER,
  measuresOf,
  metricById,
  type CubeDef,
  type Grain,
  type Metric,
  type TimeWindow,
} from "../catalog/semantic.js";

export interface Cube {
  def: CubeDef;
  columns: string[];
  rows: unknown[][];
}

export interface Manifest {
  source: string;
  dataset: string;
  asOf: string; // YYYY-MM-DD, last day with data
  generatedAt: string;
  cubes: { id: string; file: string; rows: number }[];
}

export interface QueryRequest {
  metrics: string[];
  dimensions: string[]; // non-time dimensions
  grain?: Grain; // when set, a "period" column (YYYY-MM-DD bucket start) is included
  window: TimeWindow | { start: string; end: string };
  filters?: Record<string, string[]>;
  /** limit categories to the top N by the first metric (rest folded into "Other") */
  topN?: number;
}

export type Row = Record<string, string | number | null>;

export class SnapshotStore {
  private cache = new Map<string, Cube>();
  readonly manifest: Manifest;

  constructor(readonly dir: string) {
    const m = join(dir, "manifest.json");
    if (!existsSync(m)) throw new Error(`No snapshot manifest at ${m}. Run "npm run synth" or "npm run extract".`);
    this.manifest = JSON.parse(readFileSync(m, "utf8")) as Manifest;
  }

  cube(id: string): Cube {
    let c = this.cache.get(id);
    if (!c) {
      const def = CUBES.find((x) => x.id === id);
      if (!def) throw new Error(`Unknown cube ${id}`);
      const raw = JSON.parse(readFileSync(join(this.dir, def.file), "utf8")) as { columns: string[]; rows: unknown[][] };
      c = { def, columns: raw.columns, rows: raw.rows };
      this.cache.set(id, c);
    }
    return c;
  }

  /** Pick the cheapest cube that can answer the request, or null. */
  resolveCube(metrics: Metric[], dimensions: string[], grain: Grain | undefined): CubeDef | null {
    const need = new Set(metrics.flatMap(measuresOf));
    const candidates = CUBES.filter((c) => {
      const dimsOk = dimensions.every((d) => d === "date" || c.dimensions.includes(d));
      const measOk = [...need].every((m) => c.measures.includes(m));
      const grainOk = !grain || GRAIN_ORDER[c.grain] <= GRAIN_ORDER[grain];
      return dimsOk && measOk && grainOk;
    });
    if (candidates.length === 0) return null;
    // prefer coarser grain and fewer dimensions: smaller scans, same answer
    candidates.sort((a, b) => GRAIN_ORDER[b.grain] - GRAIN_ORDER[a.grain] || a.dimensions.length - b.dimensions.length);
    return candidates[0];
  }

  /** The finest grain at which some cube can serve these metrics x dimensions, or null if none can. */
  finestGrain(metricIds: string[], dimensions: string[]): Grain | null {
    const metrics = metricIds.map(metricById);
    for (const g of ["day", "week", "month", "quarter"] as Grain[]) if (this.resolveCube(metrics, dimensions, g)) return g;
    return null;
  }

  resolveWindow(w: QueryRequest["window"]): { start: string; end: string } {
    if (typeof w !== "string") return w;
    const end = new Date(this.manifest.asOf + "T00:00:00Z");
    const start = new Date(end);
    switch (w) {
      case "last_30_days": start.setUTCDate(start.getUTCDate() - 29); break;
      case "last_90_days": start.setUTCDate(start.getUTCDate() - 89); break;
      case "last_12_months": start.setUTCMonth(start.getUTCMonth() - 12); start.setUTCDate(start.getUTCDate() + 1); break;
      case "year_to_date": start.setUTCMonth(0, 1); break;
      case "all_time": return { start: "1970-01-01", end: iso(end) };
    }
    return { start: iso(start), end: iso(end) };
  }

  /** The window of equal length immediately before `w` (for period-over-period deltas). */
  priorWindow(w: QueryRequest["window"]): { start: string; end: string } {
    const cur = this.resolveWindow(w);
    const s = new Date(cur.start + "T00:00:00Z");
    const e = new Date(cur.end + "T00:00:00Z");
    const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
    const pe = new Date(s); pe.setUTCDate(pe.getUTCDate() - 1);
    const ps = new Date(pe); ps.setUTCDate(ps.getUTCDate() - days + 1);
    return { start: iso(ps), end: iso(pe) };
  }

  query(req: QueryRequest): { cube: string; rows: Row[] } {
    const metrics = req.metrics.map(metricById);
    const def = this.resolveCube(metrics, req.dimensions, req.grain);
    if (!def) {
      throw new Error(`No cube covers metrics [${req.metrics}] x dimensions [${req.dimensions}] at grain ${req.grain ?? "none"}`);
    }
    const cube = this.cube(def.id);
    const col = (name: string) => cube.columns.indexOf(name);
    const dateIdx = col("date");
    const dimIdx = req.dimensions.filter((d) => d !== "date").map((d) => [d, col(d)] as const);
    const measures = [...new Set(metrics.flatMap(measuresOf))];
    const measIdx = measures.map((m) => [m, col(m)] as const);
    const level = new Set(def.levelMeasures ?? []);
    const { start, end } = this.resolveWindow(req.window);
    const filters = Object.entries(req.filters ?? {}).map(([d, vals]) => [col(d), new Set(vals)] as const);

    // group -> (period -> measure sums). Level measures keep the *latest* underlying period per bucket.
    const groups = new Map<string, { keys: Row; buckets: Map<string, { sums: Record<string, number>; latest: string }> }>();
    for (const r of cube.rows) {
      const d = r[dateIdx] as string;
      if (d < start || d > end) continue;
      if (filters.some(([i, set]) => !set.has(r[i] as string))) continue;
      const keys: Row = {};
      let missing = false;
      for (const [name, i] of dimIdx) { if (r[i] === null || r[i] === undefined) { missing = true; break; } keys[name] = r[i] as string; }
      if (missing) continue; // a row with no value for a requested dimension (e.g. non-US rows when grouping by state) is out of scope
      const gkey = JSON.stringify(keys);
      let g = groups.get(gkey);
      if (!g) { g = { keys, buckets: new Map() }; groups.set(gkey, g); }
      const period = req.grain ? bucket(d, req.grain) : "all";
      let b = g.buckets.get(period);
      if (!b) { b = { sums: Object.fromEntries(measures.map((m) => [m, 0])), latest: "" }; g.buckets.set(period, b); }
      const newer = d > b.latest;
      for (const [m, i] of measIdx) {
        const v = Number(r[i] ?? 0);
        if (level.has(m)) { if (newer) b.sums[m] = v; else if (d === b.latest) b.sums[m] += v; }
        else b.sums[m] += v;
      }
      if (newer) b.latest = d;
    }

    let rows: Row[] = [];
    for (const g of groups.values()) {
      for (const [period, b] of g.buckets) {
        const row: Row = { ...g.keys };
        if (req.grain) row.period = period;
        for (const m of metrics) row[m.id] = evaluate(m, b.sums);
        rows.push(row);
      }
    }
    if (req.topN && dimIdx.length > 0) rows = foldTopN(rows, dimIdx[0][0], metrics[0].id, req.topN, Boolean(req.grain));
    rows.sort((a, b) => String(a.period ?? "").localeCompare(String(b.period ?? "")) || compareKeys(a, b, dimIdx.map((x) => x[0])));
    return { cube: def.id, rows };
  }
}

function evaluate(m: Metric, s: Record<string, number>): number | null {
  const e = m.expr;
  switch (e.kind) {
    case "sum": return round(s[e.measure]);
    case "diff": return round(s[e.a] - s[e.b]);
    case "ratio": return s[e.denominator] ? round(s[e.numerator] / s[e.denominator], 4) : null;
    case "margin_pct": return s[e.revenue] ? round((s[e.revenue] - s[e.cost]) / s[e.revenue], 4) : null;
  }
}

function foldTopN(rows: Row[], dim: string, metric: string, n: number, hasPeriod: boolean): Row[] {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(String(r[dim]), (totals.get(String(r[dim])) ?? 0) + Number(r[metric] ?? 0));
  const keep = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k));
  const out = new Map<string, Row>();
  for (const r of rows) {
    const key = keep.has(String(r[dim])) ? String(r[dim]) : "Other";
    const id = `${key}|${hasPeriod ? r.period : ""}`;
    const cur = out.get(id);
    if (!cur) out.set(id, { ...r, [dim]: key });
    else for (const k of Object.keys(r)) if (typeof r[k] === "number") cur[k] = Number(cur[k] ?? 0) + Number(r[k]);
  }
  return [...out.values()];
}

export function bucket(date: string, grain: Grain): string {
  const d = new Date(date + "T00:00:00Z");
  switch (grain) {
    case "day": return date;
    case "week": { const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return iso(d); }
    case "month": return date.slice(0, 7) + "-01";
    case "quarter": { const q = Math.floor(d.getUTCMonth() / 3) * 3; return `${d.getUTCFullYear()}-${String(q + 1).padStart(2, "0")}-01`; }
  }
}

const compareKeys = (a: Row, b: Row, dims: string[]) => {
  for (const d of dims) { const c = String(a[d]).localeCompare(String(b[d])); if (c) return c; }
  return 0;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const round = (x: number, p = 2) => Math.round(x * 10 ** p) / 10 ** p;
