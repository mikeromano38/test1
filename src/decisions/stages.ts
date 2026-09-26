/**
 * The decision graph. Every stage is one Jev call with many questions
 * (speculative fan-out), followed by *code* that turns calibrated answers into
 * a plan. Jev never sees anything it does not need for the stage's questions,
 * and it is never asked to count, compute or generate text.
 */
import { COMPONENTS, SIZE_DESCRIPTIONS, compatible, componentById, type ComponentDef, type TileSize } from "../catalog/components.js";
import { CONNECTORS } from "../catalog/connectors.js";
import { LAYOUTS } from "../catalog/layouts.js";
import { DIMENSIONS, GRAINS, METRICS, TIME_WINDOWS, dimensionById, dimensionsFor, metricById, type Grain, type TimeWindow } from "../catalog/semantic.js";
import { NUMBER_FORMATS, THEMES } from "../catalog/themes.js";
import { choice, getChoice, getNoul, getScore, noul, score, type JevClient, type JevQuestion, type JevResponse } from "../jev/types.js";
import type { Archetype, Audience, DecisionRecord, DashboardDensity, FieldDecisions, PlannedTile, PresentationDecisions, ScopeDecisions, StageTrace, TileRole } from "./plan.js";

export const ARCHETYPES: Record<Archetype, string> = {
  executive_overview: "A broad summary of the business: revenue, orders, margin, customers; a few headline numbers and one or two trends",
  sales_performance: "Sales results in depth: revenue and orders over time, by product category, department, brand",
  customer_acquisition: "Where customers come from and who they are: signups, traffic sources, demographics, geography",
  product_merchandising: "What is selling: categories, brands, margins, returns, product mix",
  fulfillment_operations: "Shipping and delivery: order status, days to ship and deliver, distribution centers",
  web_engagement: "Website behaviour: sessions, events, funnel steps, conversion, browsers",
  inventory_health: "Stock levels and inventory value by warehouse and category",
};

const TIME_WINDOW_DESC: Record<TimeWindow, string> = {
  last_30_days: "Last 30 days, the last month, recent weeks: a short-term operational view",
  last_90_days: "Last 90 days, the last quarter, the last three months: recent with enough history for a trend",
  last_12_months: "Last 12 months, the past year, trailing year: the standard window for trends and seasonality",
  year_to_date: "Year to date, YTD, since January 1st of the current year",
  all_time: "All time, all history, everything available (about two years)",
};

const GRAIN_DESC: Record<Grain, string> = {
  day: "Daily, by day: for short windows or operational monitoring",
  week: "Weekly, by week: smooths daily noise over a quarter or more",
  month: "Monthly, by month: the standard for yearly views and executives",
  quarter: "Quarterly, by quarter: only for multi-year, high-level views",
};

const DENSITY_LEVELS = ["A few headline numbers and one chart", "A balanced overview: several numbers and a handful of charts", "A dense analytical view with many charts and a table"];
const DENSITY_CAPS: Record<DashboardDensity, { metrics: number; dimensions: number; kpis: number; tiles: number }> = {
  few: { metrics: 3, dimensions: 1, kpis: 3, tiles: 4 },
  balanced: { metrics: 5, dimensions: 2, kpis: 4, tiles: 8 },
  dense: { metrics: 8, dimensions: 3, kpis: 6, tiles: 12 },
};

export interface StageContext {
  jev: JevClient;
  request: string;
  /** e.g. { credentialsAvailable: false } — tells the connector question what is possible */
  environment: { credentialsAvailable: boolean; offline: boolean };
}

async function call(ctx: StageContext, stage: string, state: Record<string, unknown>, questions: Record<string, JevQuestion>): Promise<{ res: JevResponse; trace: StageTrace }> {
  const t0 = Date.now();
  const res = await ctx.jev.systemOne({ state, questions });
  const trace: StageTrace = { stage, client: ctx.jev.name, request: { state, questions }, response: res, decisions: [], ms: Date.now() - t0 };
  return { res, trace };
}

const rec = (trace: StageTrace, d: DecisionRecord) => trace.decisions.push(d);
const recChoice = (trace: StageTrace, res: JevResponse, key: string) => {
  const a = getChoice(res, key);
  rec(trace, { key, type: "choice", value: a.choice, confidence: a.confidence, probabilities: a.probabilities });
  return a;
};
const recNoul = (trace: StageTrace, res: JevResponse, key: string, threshold = 0.5) => {
  const p = getNoul(res, key);
  rec(trace, { key, type: "noul", value: p >= threshold, confidence: p });
  return p;
};
const recScore = (trace: StageTrace, res: JevResponse, key: string) => {
  const a = getScore(res, key);
  rec(trace, { key, type: "score", value: a.score, confidence: a.confidence, probabilities: a.probabilities });
  return a;
};

/* ------------------------------------------------------------------ */
/* Stage 1: scope                                                      */
/* ------------------------------------------------------------------ */
export async function scopeStage(ctx: StageContext): Promise<{ scope: ScopeDecisions; trace: StageTrace }> {
  const { res, trace } = await call(ctx, "scope", { request: ctx.request }, {
    archetype: choice("Which kind of dashboard does the request ask for?", ARCHETYPES),
    time_window: choice("Which time window does the request imply? If none is stated, pick the standard window for the kind of dashboard.", TIME_WINDOW_DESC),
    grain: choice("At which time granularity should trends be plotted?", GRAIN_DESC),
    compare_prior: noul("The reader wants each number compared with the previous period (growth, change, versus last period)."),
    density: score("How much should be on the dashboard?", DENSITY_LEVELS),
    audience: choice("Who will read this dashboard?", {
      executive: "Leadership: wants a few clear numbers and the overall trend",
      analyst: "Analyst: wants breakdowns, comparisons and the ability to dig in",
      operator: "Operations staff: wants current status and many signals at once",
    }),
    mode_preference: choice("Does the request state a visual mode preference?", {
      light: "The request asks for a light, white or bright look",
      dark: "The request asks for a dark look, a wall screen or night use",
      no_preference: "The request says nothing about light or dark",
    }),
    wants_geo: noul("The request is about geography: countries, states, regions or a map."),
    wants_breakdowns: noul("The request asks to break results down by a category (by product, by channel, by segment, etc.)."),
  });
  const density = recScore(trace, res, "density").score;
  const scope: ScopeDecisions = {
    archetype: recChoice(trace, res, "archetype").choice as Archetype,
    timeWindow: recChoice(trace, res, "time_window").choice as TimeWindow,
    grain: recChoice(trace, res, "grain").choice as Grain,
    comparePrior: recNoul(trace, res, "compare_prior") >= 0.5,
    density: density < 0.67 ? "few" : density < 1.4 ? "balanced" : "dense",
    audience: recChoice(trace, res, "audience").choice as Audience,
    modePreference: recChoice(trace, res, "mode_preference").choice as ScopeDecisions["modePreference"],
    wantsGeo: recNoul(trace, res, "wants_geo") >= 0.5,
    wantsBreakdowns: recNoul(trace, res, "wants_breakdowns") >= 0.5,
  };
  // guard: a daily grain over a year is noise, a quarterly grain over 30 days is one point
  if (scope.timeWindow === "last_30_days" && (scope.grain === "month" || scope.grain === "quarter")) scope.grain = "day";
  if ((scope.timeWindow === "last_12_months" || scope.timeWindow === "all_time") && scope.grain === "day") scope.grain = "week";
  if (scope.timeWindow === "all_time" && scope.grain === "quarter") scope.grain = "month";
  return { scope, trace };
}

/* ------------------------------------------------------------------ */
/* Stage 2: metrics & dimensions                                       */
/* ------------------------------------------------------------------ */
export async function fieldsStage(ctx: StageContext, scope: ScopeDecisions): Promise<{ fields: FieldDecisions; trace: StageTrace }> {
  const state = {
    request: ctx.request,
    dashboard_type: `${scope.archetype.replace(/_/g, " ")}: ${ARCHETYPES[scope.archetype]}`,
    audience: scope.audience,
  };
  const questions: Record<string, JevQuestion> = {};
  for (const m of METRICS) questions[`metric:${m.id}`] = noul(`The metric "${m.label}" (${m.description}) belongs on this dashboard.`);
  const dims = DIMENSIONS.filter((d) => d.kind !== "time");
  for (const d of dims) questions[`dimension:${d.id}`] = noul(`Breaking the numbers down by "${d.label}" (${d.description}) helps answer this request.`);
  questions.primary_metric = choice("Which single metric is the headline of this dashboard?", Object.fromEntries(METRICS.map((m) => [m.id, `${m.label}: ${m.description}`])));
  questions.primary_dimension = choice("Which single breakdown matters most for this request?", {
    none: "No breakdown; totals over time are enough",
    ...Object.fromEntries(dims.map((d) => [d.id, `${d.label}: ${d.description}`])),
  });

  const { res, trace } = await call(ctx, "fields", state, questions);
  const caps = DENSITY_CAPS[scope.density];
  const relevance: Record<string, number> = {};
  for (const m of METRICS) relevance[`metric:${m.id}`] = recNoul(trace, res, `metric:${m.id}`);
  for (const d of dims) relevance[`dimension:${d.id}`] = recNoul(trace, res, `dimension:${d.id}`);
  const primaryMetric = recChoice(trace, res, "primary_metric").choice;
  const primaryDimRaw = recChoice(trace, res, "primary_dimension").choice;

  const rank = (prefix: string, ids: string[]) => ids.filter((id) => relevance[`${prefix}:${id}`] >= 0.5).sort((a, b) => relevance[`${prefix}:${b}`] - relevance[`${prefix}:${a}`]);

  let metrics = rank("metric", METRICS.map((m) => m.id));
  if (!metrics.includes(primaryMetric)) metrics.unshift(primaryMetric);
  else metrics = [primaryMetric, ...metrics.filter((m) => m !== primaryMetric)];
  metrics = metrics.slice(0, caps.metrics);

  // dimensions must actually be able to break down the primary metric
  const legal = new Set(dimensionsFor(metricById(primaryMetric)));
  let dimensions = rank("dimension", dims.map((d) => d.id)).filter((d) => legal.has(d));
  const primaryDimension = primaryDimRaw !== "none" && legal.has(primaryDimRaw) ? primaryDimRaw : dimensions[0] ?? null;
  if (primaryDimension) dimensions = [primaryDimension, ...dimensions.filter((d) => d !== primaryDimension)];
  if (scope.wantsGeo && legal.has("state") && !dimensions.includes("state")) dimensions.push("state");
  if (!scope.wantsBreakdowns && scope.density === "few") dimensions = dimensions.slice(0, primaryDimension ? 1 : 0);
  dimensions = dimensions.slice(0, Math.max(caps.dimensions, scope.wantsGeo ? 2 : 0));

  return { fields: { metrics, dimensions, primaryMetric, primaryDimension, relevance }, trace };
}

/* ------------------------------------------------------------------ */
/* Stage 3: one component / size / importance per candidate tile        */
/* ------------------------------------------------------------------ */
interface Candidate {
  id: string;
  role: TileRole;
  metrics: string[];
  dimensions: string[];
  /** components legal for this candidate (union over "over time" and "snapshot" shapes) */
  options: ComponentDef[];
  describe: string;
}

export function candidateTiles(scope: ScopeDecisions, fields: FieldDecisions): Candidate[] {
  const caps = DENSITY_CAPS[scope.density];
  const out: Candidate[] = [];
  const label = (id: string) => metricById(id).label;
  const dlabel = (id: string) => dimensionById(id).label;
  const shapeOptions = (metrics: string[], dims: string[]) => {
    const ms = metrics.map(metricById), ds = dims.map(dimensionById);
    const withTime = compatible({ metrics: ms, dimensions: ds, hasTime: true });
    const noTime = compatible({ metrics: ms, dimensions: ds, hasTime: false });
    return [...new Map([...withTime, ...noTime].map((c) => [c.id, c])).values()];
  };

  fields.metrics.slice(0, caps.kpis).forEach((m, i) => {
    out.push({ id: `kpi_${i}`, role: "kpi", metrics: [m], dimensions: [], options: [componentById("kpi")], describe: `${label(m)} headline number` });
  });
  out.push({ id: "trend_0", role: "trend", metrics: [fields.primaryMetric], dimensions: [], options: shapeOptions([fields.primaryMetric], []).filter((c) => c.id !== "kpi"), describe: `${label(fields.primaryMetric)} over time` });
  if (scope.density !== "few" && fields.metrics[1]) {
    out.push({ id: "trend_1", role: "trend", metrics: [fields.metrics[1]], dimensions: [], options: shapeOptions([fields.metrics[1]], []).filter((c) => c.id !== "kpi"), describe: `${label(fields.metrics[1])} over time` });
  }
  fields.dimensions.forEach((d, i) => {
    const role: TileRole = d === "state" ? "geo" : "breakdown";
    const opts = shapeOptions([fields.primaryMetric], [d]);
    if (opts.length) out.push({ id: `breakdown_${i}`, role, metrics: [fields.primaryMetric], dimensions: [d], options: opts, describe: `${label(fields.primaryMetric)} by ${dlabel(d)}` });
  });
  if (scope.density === "dense" && fields.primaryDimension && fields.metrics[1]) {
    const opts = shapeOptions([fields.metrics[1]], [fields.primaryDimension]);
    if (opts.length) out.push({ id: "breakdown_alt", role: "breakdown", metrics: [fields.metrics[1]], dimensions: [fields.primaryDimension], options: opts, describe: `${label(fields.metrics[1])} by ${dlabel(fields.primaryDimension)}` });
  }
  if (fields.primaryDimension && scope.density !== "few") {
    const tableMetrics = fields.metrics.filter((m) => dimensionsFor(metricById(m)).includes(fields.primaryDimension!)).slice(0, 6);
    if (tableMetrics.length) out.push({ id: "detail_0", role: "detail", metrics: tableMetrics, dimensions: [fields.primaryDimension], options: [componentById("table")], describe: `${tableMetrics.map(label).join(", ")} by ${dlabel(fields.primaryDimension)} as a table` });
  }
  return out;
}

const IMPORTANCE_LEVELS = ["Leave it out: it does not help this request", "Supporting detail: nice to have", "Useful context for the request", "Essential: the request cannot be answered without it"];

export async function tilesStage(ctx: StageContext, scope: ScopeDecisions, fields: FieldDecisions): Promise<{ tiles: PlannedTile[]; trace: StageTrace }> {
  const candidates = candidateTiles(scope, fields);
  const state = {
    request: ctx.request,
    dashboard_type: scope.archetype.replace(/_/g, " "),
    audience: scope.audience,
    time_window: scope.timeWindow.replace(/_/g, " "),
    tiles: candidates.map((c) => ({ id: c.id, shows: c.describe })),
  };
  const questions: Record<string, JevQuestion> = {};
  for (const c of candidates) {
    if (c.options.length > 1) {
      questions[`${c.id}:component`] = choice(`For tile "${c.id}" (${c.describe}), which presentation serves the reader best?`, Object.fromEntries(c.options.map((o) => [o.id, `${o.label}: ${o.description}`])));
    }
    const sizes = [...new Set(c.options.flatMap((o) => o.allowedSizes))];
    if (sizes.length > 1) {
      questions[`${c.id}:size`] = choice(`How much of the row should tile "${c.id}" (${c.describe}) take?`, Object.fromEntries(sizes.map((s) => [s, SIZE_DESCRIPTIONS[s]])));
    }
    questions[`${c.id}:importance`] = score(`How important is tile "${c.id}" (${c.describe}) for this request?`, IMPORTANCE_LEVELS);
  }
  const { res, trace } = await call(ctx, "tiles", state, questions);

  const tiles: PlannedTile[] = [];
  for (const c of candidates) {
    let component = c.options[0];
    let confidence = 1;
    if (questions[`${c.id}:component`]) {
      const a = recChoice(trace, res, `${c.id}:component`);
      component = componentById(a.choice);
      confidence = a.confidence;
    }
    let size: TileSize = component.defaultSize;
    if (questions[`${c.id}:size`]) {
      const s = recChoice(trace, res, `${c.id}:size`).choice as TileSize;
      if (component.allowedSizes.includes(s)) size = s;
    }
    const importance = recScore(trace, res, `${c.id}:importance`).score;
    tiles.push({ id: c.id, role: c.role, metrics: c.metrics, dimensions: c.dimensions, hasTime: component.time === "required" || (component.id === "kpi"), component: component.id, size, importance, confidence });
  }
  // Code decides what survives: importance threshold, then the density cap, keeping the primary trend.
  const caps = DENSITY_CAPS[scope.density];
  const kept = tiles.filter((t) => t.importance >= 0.8 || t.id === "trend_0" || t.role === "kpi");
  kept.sort((a, b) => b.importance - a.importance);
  const kpis = kept.filter((t) => t.role === "kpi").slice(0, caps.kpis);
  const rest = kept.filter((t) => t.role !== "kpi").slice(0, Math.max(1, caps.tiles - kpis.length));
  return { tiles: [...kpis, ...rest], trace };
}

/* ------------------------------------------------------------------ */
/* Stage 4: layout, theme, presentation toggles, connector              */
/* ------------------------------------------------------------------ */
export async function presentationStage(ctx: StageContext, scope: ScopeDecisions, tiles: PlannedTile[]): Promise<{ presentation: PresentationDecisions; trace: StageTrace }> {
  const state = {
    request: ctx.request,
    audience: scope.audience,
    density: scope.density,
    stated_mode_preference: scope.modePreference,
    tile_count: tiles.length,
    has_table: tiles.some((t) => t.component === "table"),
    environment: {
      warehouse_credentials_available: ctx.environment.credentialsAvailable,
      offline: ctx.environment.offline,
    },
  };
  const { res, trace } = await call(ctx, "presentation", state, {
    layout: choice("Which layout template fits this dashboard?", Object.fromEntries(LAYOUTS.map((l) => [l.id, `${l.label}: ${l.description}`]))),
    theme: choice("Which theme preset fits the audience and any stated mode preference?", Object.fromEntries(THEMES.map((t) => [t.id, `${t.label} (${t.mode}, ${t.density}): ${t.description}`]))),
    number_format: choice("How should numbers be formatted?", NUMBER_FORMATS),
    gridlines: noul("The reader benefits from horizontal gridlines to read values off the charts."),
    direct_labels: noul("The reader wants values written directly on the bars and line ends rather than reading the axis."),
    sort_breakdowns: choice("How should categories be ordered in breakdown charts?", {
      by_value: "Largest value first; for ranking questions",
      natural: "The category's own order (alphabetical, or ordered bands); for lookup and comparison",
    }),
    connector: choice("Which data connector should back this dashboard, given the environment?", Object.fromEntries(CONNECTORS.map((c) => [c.id, `${c.label}: ${c.description}${c.implemented ? "" : " (not yet implemented)"}`]))),
  });
  let theme = recChoice(trace, res, "theme").choice;
  // hard rule: a stated mode preference beats the preset choice
  const preset = THEMES.find((t) => t.id === theme)!;
  if (scope.modePreference !== "no_preference" && preset.mode !== scope.modePreference) {
    theme = THEMES.find((t) => t.mode === scope.modePreference && t.density === preset.density)?.id ?? THEMES.find((t) => t.mode === scope.modePreference)!.id;
    rec(trace, { key: "theme:override", type: "choice", value: theme, confidence: 1 });
  }
  let connector = recChoice(trace, res, "connector").choice;
  if (!CONNECTORS.find((c) => c.id === connector)?.implemented) {
    rec(trace, { key: "connector:fallback", type: "choice", value: "static_snapshot", confidence: 1 });
    connector = "static_snapshot";
  }
  return {
    presentation: {
      layout: recChoice(trace, res, "layout").choice,
      theme,
      numberFormat: recChoice(trace, res, "number_format").choice as PresentationDecisions["numberFormat"],
      gridlines: recNoul(trace, res, "gridlines") >= 0.5,
      directLabels: recNoul(trace, res, "direct_labels") >= 0.5,
      sortBreakdowns: recChoice(trace, res, "sort_breakdowns").choice as PresentationDecisions["sortBreakdowns"],
      connector,
    },
    trace,
  };
}

export { COMPONENTS, GRAINS, TIME_WINDOWS };
