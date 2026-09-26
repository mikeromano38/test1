/**
 * The generation seam. Jev decides; it does not write. Anything that is free
 * text (titles, subtitles, an insight sentence) or an open-ended parameter
 * comes from a ParameterGenerator. The default is pure templates so the whole
 * pipeline runs without any LLM. An LLM-backed implementation only needs to
 * satisfy this interface (it receives the *decided* plan, so its prompt is
 * small and its output is bounded to labels).
 */
import { dimensionById, metricById } from "../catalog/semantic.js";
import type { Plan, PlannedTile } from "../decisions/plan.js";

export interface ParameterGenerator {
  readonly name: string;
  dashboardTitle(plan: Plan): Promise<{ title: string; subtitle: string }>;
  tileTitle(plan: Plan, tile: PlannedTile): Promise<string>;
}

const GRAIN_LABEL: Record<string, string> = { day: "daily", week: "weekly", month: "monthly", quarter: "quarterly" };

const WINDOW_LABEL: Record<string, string> = {
  last_30_days: "last 30 days",
  last_90_days: "last 90 days",
  last_12_months: "last 12 months",
  year_to_date: "year to date",
  all_time: "all time",
};

export class TemplateParameterGenerator implements ParameterGenerator {
  readonly name = "template";

  async dashboardTitle(plan: Plan) {
    const title = plan.scope.archetype.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    const subtitle = `theLook eCommerce · ${WINDOW_LABEL[plan.scope.timeWindow]} · ${GRAIN_LABEL[plan.scope.grain]}`;
    return { title, subtitle };
  }

  async tileTitle(plan: Plan, tile: PlannedTile) {
    const metrics = tile.metrics.map((m) => metricById(m).label);
    const dim = tile.dimensions[0] ? decap(dimensionById(tile.dimensions[0]).label) : null;
    if (tile.role === "kpi") return metrics[0];
    if (tile.role === "detail") return `${dim ? capitalize(dim) : "Detail"} table`;
    if (dim && tile.hasTime) return `${metrics[0]} by ${dim} over time`;
    if (dim) return `${metrics[0]} by ${dim}`;
    return `${metrics[0]} over time`;
  }
}

/**
 * Placeholder for an LLM-backed generator (Gemini, Claude, ...). It should
 * take the plan, ask for short labels only, and validate lengths before
 * returning. Kept as a stub so the seam is visible without adding a provider.
 */
export class LlmParameterGenerator implements ParameterGenerator {
  readonly name = "llm-stub";
  constructor(private readonly fallback: ParameterGenerator = new TemplateParameterGenerator()) {}
  dashboardTitle(plan: Plan) { return this.fallback.dashboardTitle(plan); }
  tileTitle(plan: Plan, tile: PlannedTile) { return this.fallback.tileTitle(plan, tile); }
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "Product category" -> "product category", but "US state" stays "US state" */
const decap = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s);
