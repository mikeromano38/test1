/**
 * Component library. Each entry is a *declarative* Vega-Lite (or HTML stat
 * tile) template plus the constraints that decide when it is a legal choice.
 * Jev only ever chooses among the components that pass `compatible()`, so a
 * bad pick is a bad chart, never a broken one.
 */
import type { Dimension, Metric } from "./semantic.js";

export type TileSize = "sm" | "md" | "lg" | "xl" | "full";
export const SIZE_COLS: Record<TileSize, number> = { sm: 3, md: 4, lg: 6, xl: 8, full: 12 };
export const SIZE_DESCRIPTIONS: Record<TileSize, string> = {
  sm: "small: a quarter of the row; stat tiles and simple sparklines",
  md: "medium: a third of the row; secondary breakdowns",
  lg: "large: half the row; the standard chart size",
  xl: "extra large: two thirds of the row; the main trend chart",
  full: "full width: dense tables, heatmaps, maps and the single hero chart",
};

export type ColorJob = "none" | "sequential" | "categorical" | "ordinal" | "emphasis";

export interface ComponentDef {
  id: string;
  label: string;
  /** what Jev reads when choosing; describe the reader's job, not the marks */
  description: string;
  kind: "kpi" | "chart" | "table" | "map";
  metrics: { min: number; max: number };
  dimensions: { min: number; max: number };
  time: "required" | "optional" | "none";
  /** upper bound on the categorical dimension's cardinality (series ladder / ~7 classes rule) */
  maxCardinality?: number;
  needsGeo?: boolean;
  colorJob: ColorJob;
  defaultSize: TileSize;
  allowedSizes: TileSize[];
}

export const COMPONENTS: ComponentDef[] = [
  {
    id: "kpi", label: "Stat tile", kind: "kpi",
    description: "A single headline number with a delta versus the prior period and a small sparkline. Use when the reader needs the current value, not its shape.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 0, max: 0 }, time: "optional", colorJob: "none",
    defaultSize: "sm", allowedSizes: ["sm", "md"],
  },
  {
    id: "line", label: "Line chart", kind: "chart",
    description: "One metric over time as a single line. The default for trend questions.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 0, max: 0 }, time: "required", colorJob: "none",
    defaultSize: "lg", allowedSizes: ["md", "lg", "xl", "full"],
  },
  {
    id: "area", label: "Area chart", kind: "chart",
    description: "One metric over time with a light fill under the line. Emphasises accumulated volume; otherwise the same job as a line.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 0, max: 0 }, time: "required", colorJob: "none",
    defaultSize: "lg", allowedSizes: ["md", "lg", "xl", "full"],
  },
  {
    id: "multi_line", label: "Multi-series line", kind: "chart",
    description: "One metric over time, one line per category (up to 6 categories). Use when the reader must compare how categories trend against each other.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "required", maxCardinality: 6, colorJob: "categorical",
    defaultSize: "lg", allowedSizes: ["lg", "xl", "full"],
  },
  {
    id: "small_multiples", label: "Small multiples", kind: "chart",
    description: "One metric over time as a grid of tiny line charts, one per category (up to 12). Use for many categories where a multi-line chart would tangle.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "required", maxCardinality: 12, colorJob: "none",
    defaultSize: "full", allowedSizes: ["xl", "full"],
  },
  {
    id: "bar_ranked", label: "Ranked bar chart", kind: "chart",
    description: "Horizontal bars ranking categories by one metric, largest first (up to 15 categories, the rest folded into Other). Use for 'which categories are biggest'.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "none", maxCardinality: 60, colorJob: "sequential",
    defaultSize: "lg", allowedSizes: ["md", "lg", "xl"],
  },
  {
    id: "column", label: "Column chart", kind: "chart",
    description: "Vertical columns comparing one metric across a few categories in their natural order (up to 8). Use for ordered groups such as age bands or funnel stages.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "none", maxCardinality: 8, colorJob: "ordinal",
    defaultSize: "md", allowedSizes: ["md", "lg"],
  },
  {
    id: "stacked_bar_time", label: "Stacked bars over time", kind: "chart",
    description: "One metric over time as stacked bars split by category (up to 6). Use for how the mix changes period to period.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "required", maxCardinality: 6, colorJob: "categorical",
    defaultSize: "lg", allowedSizes: ["lg", "xl", "full"],
  },
  {
    id: "donut", label: "Donut chart", kind: "chart",
    description: "Share of one metric across at most 5 categories, with the total in the middle. Only for an at-a-glance part-to-whole; never for comparing close values.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "none", maxCardinality: 5, colorJob: "categorical",
    defaultSize: "md", allowedSizes: ["md", "lg"],
  },
  {
    id: "heatmap", label: "Heatmap", kind: "chart",
    description: "A grid of category (rows) by time period (columns) shaded by one metric. Use for spotting seasonality or hot spots across many categories.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "required", maxCardinality: 30, colorJob: "sequential",
    defaultSize: "full", allowedSizes: ["xl", "full"],
  },
  {
    id: "table", label: "Table", kind: "table",
    description: "A sortable table of one or more metrics by one or two categories. Use when exact values matter or there are too many categories for a chart.",
    metrics: { min: 1, max: 6 }, dimensions: { min: 1, max: 2 }, time: "none", colorJob: "none",
    defaultSize: "lg", allowedSizes: ["lg", "xl", "full"],
  },
  {
    id: "choropleth_us", label: "US state map", kind: "map",
    description: "A map of US states shaded by one metric. Only when the reader cares about where, by state.",
    metrics: { min: 1, max: 1 }, dimensions: { min: 1, max: 1 }, time: "none", needsGeo: true, colorJob: "sequential",
    defaultSize: "lg", allowedSizes: ["lg", "xl", "full"],
  },
];

export const componentById = (id: string): ComponentDef => {
  const c = COMPONENTS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown component ${id}`);
  return c;
};

export interface TileShape {
  metrics: Metric[];
  dimensions: Dimension[]; // non-time
  hasTime: boolean;
}

/** Hard constraints: the set of components Jev is allowed to choose between for a tile. */
export function compatible(shape: TileShape): ComponentDef[] {
  return COMPONENTS.filter((c) => {
    if (shape.metrics.length < c.metrics.min || shape.metrics.length > c.metrics.max) return false;
    if (shape.dimensions.length < c.dimensions.min || shape.dimensions.length > c.dimensions.max) return false;
    if (c.time === "required" && !shape.hasTime) return false;
    if (c.time === "none" && shape.hasTime) return false;
    const dim = shape.dimensions[0];
    if (dim) {
      if (c.maxCardinality && dim.cardinality > c.maxCardinality) return false;
      if (c.needsGeo && dim.id !== "state") return false;
      if (c.id === "column" && !dim.ordered) return false;
      if (dim.id === "state" && !c.needsGeo && c.id !== "table" && c.id !== "bar_ranked") return false;
    }
    return true;
  });
}
