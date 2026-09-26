/**
 * Vega-Lite templates for the component library, parameterised by metric,
 * dimension, grain, theme and presentation toggles. Everything here is data
 * in, JSON out; no rendering. Rules baked in (from the dataviz method):
 * thin marks, rounded data-ends, hairline solid grid, categorical hues in a
 * fixed order that follows the entity, one hue for magnitude, legends for
 * >= 2 series only, selective direct labels.
 */
import type { Grain, Metric, Dimension } from "../catalog/semantic.js";
import type { PresentationOptions, ThemePreset } from "../catalog/themes.js";
import type { Row } from "../data/query.js";

export interface ChartInputs {
  component: string;
  metric: Metric;
  dimension?: Dimension;
  grain: Grain;
  rows: Row[];
  theme: ThemePreset;
  presentation: PresentationOptions;
  height: number;
  /** approximate pixel width of the tile body; only facets need it (Vega-Lite facets cannot use width: "container") */
  widthHint?: number;
  /** stable category order (by total, or natural), decided by the composer */
  categoryOrder?: string[];
}

type VL = Record<string, unknown>;

export function d3Format(format: Metric["format"], numberFormat: PresentationOptions["numberFormat"]): string {
  switch (format) {
    case "currency": return numberFormat === "compact" ? "$.3~s" : "$,.0f";
    case "number": return numberFormat === "compact" ? ".3~s" : ",.0f";
    case "percent": return ".1%";
    case "days": return ".1f";
  }
}

const TIME_UNIT: Record<Grain, string> = { day: "yearmonthdate", week: "yearmonthdate", month: "yearmonth", quarter: "yearquarter" };
const TIME_FORMAT: Record<Grain, string> = { day: "%b %d", week: "%b %d", month: "%b %Y", quarter: "Q%q %Y" };

export function vegaConfig(theme: ThemePreset, p: PresentationOptions): VL {
  const t = theme.tokens;
  const fs = theme.baseFontPx;
  return {
    background: "transparent",
    font: theme.fontFamily,
    padding: 4,
    view: { stroke: null },
    axis: {
      labelColor: t.textMuted, titleColor: t.textSecondary, labelFontSize: fs - 2, titleFontSize: fs - 2, titleFontWeight: "normal",
      gridColor: t.grid, gridWidth: 1, gridDash: [], domainColor: t.axis, tickColor: t.axis, labelPadding: 6,
    },
    axisX: { grid: false, labelAngle: 0 },
    axisY: { grid: p.gridlines, domain: false, ticks: false },
    legend: { labelColor: t.textSecondary, titleColor: t.textSecondary, labelFontSize: fs - 2, titleFontSize: fs - 2, orient: "top", direction: "horizontal", symbolType: "circle", symbolSize: 80, title: null },
    title: { color: t.textPrimary, subtitleColor: t.textSecondary, anchor: "start", fontSize: fs, fontWeight: 600 },
    range: { category: t.categorical, ramp: t.sequential, heatmap: t.sequential },
    line: { strokeWidth: 2, strokeJoin: "round", strokeCap: "round" },
    area: { line: true },
    bar: { cornerRadiusEnd: 4 },
    rule: { color: t.axis },
    point: { filled: true, size: 64 },
    text: { color: t.textSecondary, fontSize: fs - 2 },
  };
}

export function buildVegaLite(i: ChartInputs): VL {
  const base: VL = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: i.height,
    autosize: { type: "fit-x", contains: "padding" },
    data: { values: i.rows },
    config: vegaConfig(i.theme, i.presentation),
  };
  switch (i.component) {
    case "line": return { ...base, layer: trendLayers(i, false) };
    case "area": return { ...base, layer: trendLayers(i, true) };
    case "multi_line": return { ...base, layer: multiLineLayers(i) };
    case "small_multiples": return { ...base, ...smallMultiples(i) };
    case "bar_ranked": return { ...base, height: { step: 28 }, layer: rankedBarLayers(i) };
    case "column": return { ...base, layer: columnLayers(i) };
    case "stacked_bar_time": return { ...base, ...stackedBars(i) };
    case "donut": return { ...base, ...donut(i) };
    case "heatmap": return { ...base, ...heatmap(i) };
    case "choropleth_us": return { ...base, ...choropleth(i) };
    default: throw new Error(`No Vega-Lite template for component ${i.component}`);
  }
}

/* ---------- shared encodings ---------- */

const xTime = (i: ChartInputs): VL => ({
  field: "period", type: "temporal", timeUnit: TIME_UNIT[i.grain],
  axis: { title: null, format: TIME_FORMAT[i.grain], tickCount: 6, labelOverlap: "greedy" },
});
const yMetric = (i: ChartInputs, extra: VL = {}): VL => ({
  field: i.metric.id, type: "quantitative",
  axis: { title: null, format: d3Format(i.metric.format, i.presentation.numberFormat), tickCount: 4 },
  ...extra,
});
const tooltip = (i: ChartInputs, withDim: boolean, withTime = true): VL[] => [
  ...(withTime ? [{ field: "period", type: "temporal", timeUnit: TIME_UNIT[i.grain], title: "Period", format: TIME_FORMAT[i.grain] }] : []),
  ...(withDim && i.dimension ? [{ field: i.dimension.id, type: "nominal", title: i.dimension.label }] : []),
  { field: i.metric.id, type: "quantitative", title: i.metric.label, format: d3Format(i.metric.format, "precise") },
];
const hoverParam = (fields: string[]): VL => ({
  name: "hover",
  select: { type: "point", fields, nearest: true, on: "pointermove", clear: "pointerout" },
});
const slot1 = (i: ChartInputs) => i.theme.tokens.categorical[0];
const fmt = (i: ChartInputs) => d3Format(i.metric.format, i.presentation.numberFormat);

/* ---------- trend: line / area, single series ---------- */
function trendLayers(i: ChartInputs, area: boolean): VL[] {
  const color = slot1(i);
  const layers: VL[] = [];
  if (area) layers.push({ mark: { type: "area", color, opacity: 0.12, line: false }, encoding: { x: xTime(i), y: yMetric(i) } });
  layers.push({ mark: { type: "line", color }, encoding: { x: xTime(i), y: yMetric(i) } });
  layers.push({
    params: [hoverParam(["period"])],
    mark: { type: "point", color, stroke: i.theme.tokens.surface, strokeWidth: 2, size: 80 },
    encoding: {
      x: xTime(i), y: yMetric(i),
      opacity: { condition: { param: "hover", empty: false, value: 1 }, value: 0 },
      tooltip: tooltip(i, false),
    },
  });
  layers.push({
    transform: [{ filter: { param: "hover", empty: false } }],
    mark: { type: "rule", color: i.theme.tokens.axis },
    encoding: { x: xTime(i) },
  });
  if (i.presentation.directLabels) layers.push(endLabel(i, color));
  return layers;
}

function endLabel(i: ChartInputs, _color: string, colorField?: string): VL {
  return {
    transform: [
      { joinaggregate: [{ op: "max", field: "period", as: "_maxp" }], ...(colorField ? { groupby: [colorField] } : {}) },
      { filter: "datum.period == datum._maxp" },
    ],
    mark: { type: "text", align: "left", dx: 8, fontWeight: 600, color: i.theme.tokens.textSecondary },
    encoding: { x: xTime(i), y: yMetric(i), text: { field: i.metric.id, type: "quantitative", format: fmt(i) } },
  };
}

/* ---------- multi-series line ---------- */
function multiLineLayers(i: ChartInputs): VL[] {
  const dim = i.dimension!;
  const color: VL = { field: dim.id, type: "nominal", scale: { domain: i.categoryOrder }, legend: { title: null } };
  const layers: VL[] = [
    { mark: { type: "line" }, encoding: { x: xTime(i), y: yMetric(i), color } },
    {
      params: [hoverParam(["period"])],
      mark: { type: "point", stroke: i.theme.tokens.surface, strokeWidth: 2, size: 80 },
      encoding: { x: xTime(i), y: yMetric(i), color, opacity: { condition: { param: "hover", empty: false, value: 1 }, value: 0 }, tooltip: tooltip(i, true) },
    },
    { transform: [{ filter: { param: "hover", empty: false } }], mark: { type: "rule", color: i.theme.tokens.axis }, encoding: { x: xTime(i) } },
  ];
  if (i.presentation.directLabels && (i.categoryOrder?.length ?? 0) <= 4) {
    layers.push({
      transform: [{ joinaggregate: [{ op: "max", field: "period", as: "_maxp" }], groupby: [dim.id] }, { filter: "datum.period == datum._maxp" }],
      mark: { type: "text", align: "left", dx: 8, color: i.theme.tokens.textSecondary },
      encoding: { x: xTime(i), y: yMetric(i), text: { field: dim.id, type: "nominal" } },
    });
  }
  return layers;
}

/* ---------- small multiples ---------- */
function smallMultiples(i: ChartInputs): VL {
  const dim = i.dimension!;
  const n = i.categoryOrder?.length ?? new Set(i.rows.map((r) => r[dim.id])).size;
  const columns = 4;
  const panelRows = Math.max(1, Math.ceil(n / columns));
  const width = Math.max(90, Math.floor(((i.widthHint ?? 600) - 80) / columns) - 60);
  const height = Math.max(60, Math.floor((i.height - 40 * panelRows) / panelRows));
  return {
    width: undefined,
    height: undefined,
    autosize: undefined,
    columns,
    facet: { field: dim.id, type: "nominal", sort: i.categoryOrder, header: { title: null, labelColor: i.theme.tokens.textSecondary, labelFontSize: i.theme.baseFontPx - 2 } },
    spec: {
      width, height,
      mark: { type: "line", color: slot1(i) },
      encoding: { x: { ...xTime(i), axis: { title: null, format: TIME_FORMAT[i.grain], tickCount: 2 } }, y: yMetric(i, { axis: { title: null, format: fmt(i), tickCount: 3 } }), tooltip: tooltip(i, true) },
    },
  };
}

/* ---------- ranked horizontal bars ---------- */
function rankedBarLayers(i: ChartInputs): VL[] {
  const dim = i.dimension!;
  const y: VL = { field: dim.id, type: "nominal", sort: i.presentation.sortBreakdowns === "by_value" ? "-x" : i.categoryOrder ?? "ascending", axis: { title: null, labelLimit: 160 } };
  const x: VL = { field: i.metric.id, type: "quantitative", axis: { title: null, format: fmt(i), tickCount: 4, grid: i.presentation.gridlines } };
  const layers: VL[] = [
    { mark: { type: "bar", color: slot1(i), size: 18, cornerRadiusEnd: 4 }, encoding: { y, x, tooltip: tooltip(i, true, false) } },
  ];
  if (i.presentation.directLabels) {
    layers.push({ mark: { type: "text", align: "left", dx: 6, color: i.theme.tokens.textSecondary }, encoding: { y, x, text: { field: i.metric.id, type: "quantitative", format: fmt(i) } } });
  }
  return layers;
}

/* ---------- ordered columns (ordinal ramp) ---------- */
function columnLayers(i: ChartInputs): VL[] {
  const dim = i.dimension!;
  const order = i.categoryOrder ?? [];
  const seq = i.theme.tokens.sequential;
  const ramp = order.map((_, k) => seq[Math.min(seq.length - 1, 1 + Math.round((k / Math.max(1, order.length - 1)) * (seq.length - 3)))]);
  const x: VL = { field: dim.id, type: "nominal", sort: order, axis: { title: null, labelAngle: 0 } };
  const layers: VL[] = [
    {
      mark: { type: "bar", size: 24, cornerRadiusEnd: 4 },
      encoding: { x, y: yMetric(i), color: { field: dim.id, type: "nominal", scale: { domain: order, range: ramp }, legend: null }, tooltip: tooltip(i, true, false) },
    },
  ];
  if (i.presentation.directLabels) layers.push({ mark: { type: "text", dy: -8, color: i.theme.tokens.textSecondary }, encoding: { x, y: yMetric(i), text: { field: i.metric.id, type: "quantitative", format: fmt(i) } } });
  return layers;
}

/* ---------- stacked bars over time ---------- */
function stackedBars(i: ChartInputs): VL {
  const dim = i.dimension!;
  return {
    mark: { type: "bar", stroke: i.theme.tokens.surface, strokeWidth: 1, width: { band: i.rows.length > 60 ? 0.9 : 0.55 }, cornerRadius: 2 },
    encoding: {
      x: { ...xTime(i), type: "ordinal", timeUnit: TIME_UNIT[i.grain], axis: { title: null, format: TIME_FORMAT[i.grain], labelAngle: 0, labelOverlap: "greedy" } },
      y: yMetric(i, { stack: "zero" }),
      color: { field: dim.id, type: "nominal", scale: { domain: i.categoryOrder }, legend: { title: null } },
      order: { field: "_order", type: "quantitative" },
      tooltip: tooltip(i, true),
    },
    transform: [{ calculate: `indexof(${JSON.stringify(i.categoryOrder ?? [])}, datum[${JSON.stringify(dim.id)}])`, as: "_order" }],
  };
}

/* ---------- donut ---------- */
function donut(i: ChartInputs): VL {
  const dim = i.dimension!;
  const total = i.rows.reduce((a, r) => a + Number(r[i.metric.id] ?? 0), 0);
  const totalText = formatValue(total, i.metric.format, i.presentation.numberFormat);
  return {
    layer: [
      {
        mark: { type: "arc", innerRadius: Math.round(i.height * 0.3), outerRadius: Math.round(i.height * 0.42), stroke: i.theme.tokens.surface, strokeWidth: 2 },
        encoding: {
          theta: { field: i.metric.id, type: "quantitative", stack: "normalize" },
          color: { field: dim.id, type: "nominal", scale: { domain: i.categoryOrder }, legend: { title: null, orient: "right", direction: "vertical" } },
          order: { field: "_order", type: "quantitative" },
          tooltip: tooltip(i, true, false),
        },
      },
      { data: { values: [{ t: totalText }] }, mark: { type: "text", fontSize: i.theme.baseFontPx + 6, fontWeight: 600, color: i.theme.tokens.textPrimary }, encoding: { text: { field: "t" } } },
    ],
    transform: [{ calculate: `indexof(${JSON.stringify(i.categoryOrder ?? [])}, datum[${JSON.stringify(dim.id)}])`, as: "_order" }],
  };
}

/* ---------- heatmap ---------- */
function heatmap(i: ChartInputs): VL {
  const dim = i.dimension!;
  return {
    height: { step: 22 },
    mark: { type: "rect", stroke: i.theme.tokens.surface, strokeWidth: 2, cornerRadius: 3 },
    encoding: {
      x: { field: "period", type: "ordinal", timeUnit: TIME_UNIT[i.grain], axis: { title: null, format: TIME_FORMAT[i.grain], labelAngle: 0, labelOverlap: "greedy" } },
      y: { field: dim.id, type: "nominal", sort: i.categoryOrder, axis: { title: null, labelLimit: 160 } },
      color: { field: i.metric.id, type: "quantitative", scale: { range: i.theme.tokens.sequential, interpolate: "lab" }, legend: { title: i.metric.label, format: fmt(i), orient: "top", direction: "horizontal", gradientLength: 160 } },
      tooltip: tooltip(i, true),
    },
  };
}

/* ---------- US choropleth ---------- */
const FIPS: Record<string, number> = { Alabama: 1, Alaska: 2, Arizona: 4, Arkansas: 5, California: 6, Colorado: 8, Connecticut: 9, Delaware: 10, "District of Columbia": 11, Florida: 12, Georgia: 13, Hawaii: 15, Idaho: 16, Illinois: 17, Indiana: 18, Iowa: 19, Kansas: 20, Kentucky: 21, Louisiana: 22, Maine: 23, Maryland: 24, Massachusetts: 25, Michigan: 26, Minnesota: 27, Mississippi: 28, Missouri: 29, Montana: 30, Nebraska: 31, Nevada: 32, "New Hampshire": 33, "New Jersey": 34, "New Mexico": 35, "New York": 36, "North Carolina": 37, "North Dakota": 38, Ohio: 39, Oklahoma: 40, Oregon: 41, Pennsylvania: 42, "Rhode Island": 44, "South Carolina": 45, "South Dakota": 46, Tennessee: 47, Texas: 48, Utah: 49, Vermont: 50, Virginia: 51, Washington: 53, "West Virginia": 54, Wisconsin: 55, Wyoming: 56 };

function choropleth(i: ChartInputs): VL {
  const values = i.rows.filter((r) => r.state && FIPS[String(r.state)]).map((r) => ({ id: FIPS[String(r.state)], state: r.state, [i.metric.id]: r[i.metric.id] }));
  return {
    data: { url: "https://cdn.jsdelivr.net/npm/vega-datasets@2/data/us-10m.json", format: { type: "topojson", feature: "states" } },
    projection: { type: "albersUsa" },
    transform: [{ lookup: "id", from: { data: { values }, key: "id", fields: ["state", i.metric.id] } }],
    mark: { type: "geoshape", stroke: i.theme.tokens.surface, strokeWidth: 1 },
    encoding: {
      color: { field: i.metric.id, type: "quantitative", scale: { range: i.theme.tokens.sequential, interpolate: "lab" }, legend: { title: i.metric.label, format: fmt(i), orient: "bottom-right", gradientLength: 140 }, condition: { test: "!isValid(datum[" + JSON.stringify(i.metric.id) + "])", value: i.theme.tokens.grid } },
      tooltip: [{ field: "state", type: "nominal", title: "State" }, { field: i.metric.id, type: "quantitative", title: i.metric.label, format: d3Format(i.metric.format, "precise") }],
    },
  };
}

/* ---------- value formatting used for KPI text and donut totals ---------- */
export function formatValue(v: number | null, format: Metric["format"], numberFormat: PresentationOptions["numberFormat"]): string {
  if (v === null || Number.isNaN(v)) return "–";
  switch (format) {
    case "percent": return `${(v * 100).toFixed(1)}%`;
    case "days": return `${v.toFixed(1)} d`;
    case "currency": return numberFormat === "compact" ? `$${compact(v)}` : `$${Math.round(v).toLocaleString("en-US")}`;
    case "number": return numberFormat === "compact" ? compact(v) : Math.round(v).toLocaleString("en-US");
  }
}

function compact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return abs >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(abs >= 10 ? 1 : 2);
}
