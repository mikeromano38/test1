import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPONENTS } from "./catalog/components.js";
import { CONNECTORS } from "./catalog/connectors.js";
import { LAYOUTS } from "./catalog/layouts.js";
import { CUBES, DIMENSIONS, METRICS } from "./catalog/semantic.js";
import { THEMES } from "./catalog/themes.js";
import { composeDashboard } from "./compose/composer.js";
import type { DashboardSpec } from "./compose/spec.js";
import { SnapshotStore } from "./data/query.js";
import { planDashboard } from "./decisions/pipeline.js";
import { createJevClient, type JevMode } from "./jev/index.js";
import type { Plan, PlannedTile } from "./decisions/plan.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const EXAMPLE_REQUESTS: Record<string, string> = {
  exec_overview: "Give me an executive overview of the business for the last 12 months with revenue, orders and margin, compared to the prior period.",
  category_sales: "Show sales performance by product category and department over the past year, monthly, for an analyst.",
  acquisition_geo: "Where are our new customers coming from? Signups by traffic source and a map of revenue by US state, year to date.",
  ops_dark: "A dark dashboard for the fulfilment team: days to ship and deliver by distribution center for the last 30 days, dense, daily.",
  web_funnel: "Website engagement: sessions, conversion rate and events by event type for the last 90 days, weekly.",
  inventory: "Inventory health: stock on hand and inventory value by warehouse and category, monthly.",
};

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) args[k] = argv[++i];
      else args[k] = true;
    } else positional.push(a);
  }
  return { args, positional };
}

export async function generate(request: string, opts: { jev?: JevMode; snapshots?: string } = {}): Promise<DashboardSpec> {
  const jev = createJevClient(opts.jev ?? "auto", join(ROOT, "fixtures/jev"));
  const store = new SnapshotStore(opts.snapshots ?? join(ROOT, "data/snapshots"));
  const plan = await planDashboard(request, { jev, environment: { credentialsAvailable: Boolean(process.env.GCP_PROJECT), offline: !process.env.GCP_PROJECT } });
  return composeDashboard(plan, { store });
}

/** One tile per component, with no Jev involved: a visual regression page for the template library. */
export async function gallery(themeId = "daylight", snapshots?: string): Promise<DashboardSpec> {
  const store = new SnapshotStore(snapshots ?? join(ROOT, "data/snapshots"));
  const tile = (id: string, component: string, metrics: string[], dimensions: string[], hasTime: boolean, size: PlannedTile["size"]): PlannedTile =>
    ({ id, role: component === "kpi" ? "kpi" : component === "table" ? "detail" : dimensions[0] === "state" ? "geo" : dimensions.length ? "breakdown" : "trend", metrics, dimensions, hasTime, component, size, importance: 2, confidence: 1 });
  const plan: Plan = {
    request: "component gallery",
    scope: { archetype: "sales_performance", timeWindow: "last_12_months", grain: "month", comparePrior: true, density: "dense", audience: "analyst", modePreference: "no_preference", wantsGeo: true, wantsBreakdowns: true },
    fields: { metrics: ["revenue", "orders", "gross_margin_pct", "return_rate"], dimensions: ["category", "traffic_source", "age_band", "state"], primaryMetric: "revenue", primaryDimension: "category", relevance: {} },
    tiles: [
      tile("kpi_0", "kpi", ["revenue"], [], true, "sm"), tile("kpi_1", "kpi", ["orders"], [], true, "sm"), tile("kpi_2", "kpi", ["gross_margin_pct"], [], true, "sm"), tile("kpi_3", "kpi", ["return_rate"], [], true, "sm"),
      tile("line", "line", ["revenue"], [], true, "lg"), tile("area", "area", ["orders"], [], true, "lg"),
      tile("multi_line", "multi_line", ["revenue"], ["traffic_source"], true, "lg"), tile("stacked", "stacked_bar_time", ["revenue"], ["department"], true, "lg"),
      tile("bar_ranked", "bar_ranked", ["revenue"], ["category"], false, "lg"), tile("column", "column", ["orders"], ["age_band"], false, "md"), tile("donut", "donut", ["revenue"], ["traffic_source"], false, "sm"),
      tile("heatmap", "heatmap", ["revenue"], ["category"], true, "full"), tile("small_multiples", "small_multiples", ["orders"], ["distribution_center"], true, "full"),
      tile("map", "choropleth_us", ["revenue"], ["state"], false, "lg"), tile("table", "table", ["revenue", "orders", "gross_margin_pct", "return_rate"], ["category"], false, "lg"),
    ],
    presentation: { layout: "kpi_row_grid", theme: themeId, numberFormat: "compact", gridlines: true, directLabels: true, sortBreakdowns: "by_value", connector: "static_snapshot" },
    trace: [],
  };
  const spec = await composeDashboard(plan, { store });
  spec.title = `Component gallery (${themeId})`;
  spec.subtitle = "every component template, no Jev decisions involved";
  return spec;
}

export function standaloneHtml(spec: DashboardSpec): string {
  const viewer = readFileSync(join(ROOT, "viewer/index.html"), "utf8");
  const json = JSON.stringify(spec).replace(/<\/script/g, "<\\/script");
  return viewer.replace("/*__INLINE_SPEC__*/", `window.__DASHBOARD_SPEC__ = ${json};`);
}

function writeOutputs(spec: DashboardSpec, outDir: string, name: string) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(spec, null, 2));
  writeFileSync(join(outDir, `${name}.html`), standaloneHtml(spec));
  const { tiles, decisions } = spec;
  console.log(`${name}: ${tiles.length} tiles · layout=${spec.layout.template} theme=${spec.theme.id} · jev=${decisions.client}`);
  for (const t of tiles) console.log(`  - ${t.id.padEnd(14)} ${t.component.padEnd(17)} ${t.size.padEnd(4)} r${t.placement.rowStart}c${t.placement.colStart} span${t.placement.colSpan}  "${t.title}"  (${t.rowCount} rows, importance ${t.importance.toFixed(2)})`);
  console.log(`  -> ${join(outDir, `${name}.html`)}`);
}

async function main() {
  const { args, positional } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];
  const jevMode = (args.jev as JevMode | undefined) ?? "auto";
  const outDir = (args.out as string | undefined) ?? join(ROOT, "out");

  if (cmd === "generate") {
    const request = positional.slice(1).join(" ") || EXAMPLE_REQUESTS.exec_overview;
    const spec = await generate(request, { jev: jevMode });
    writeOutputs(spec, outDir, (args.name as string | undefined) ?? "dashboard");
    return;
  }
  if (cmd === "examples") {
    const dir = (args.out as string | undefined) ?? join(ROOT, "examples");
    for (const [name, request] of Object.entries(EXAMPLE_REQUESTS)) {
      const spec = await generate(request, { jev: jevMode });
      writeOutputs(spec, dir, name);
    }
    return;
  }
  if (cmd === "gallery") {
    const theme = (args.theme as string | undefined) ?? "daylight";
    writeOutputs(await gallery(theme), outDir, `gallery_${theme}`);
    return;
  }
  if (cmd === "catalog") {
    console.log(`Metrics (${METRICS.length}):`); for (const m of METRICS) console.log(`  ${m.id.padEnd(20)} ${m.label.padEnd(22)} ${m.format.padEnd(9)} ${m.description}`);
    console.log(`\nDimensions (${DIMENSIONS.length}):`); for (const d of DIMENSIONS) console.log(`  ${d.id.padEnd(20)} ${d.label.padEnd(22)} ${String(d.cardinality).padEnd(5)} ${d.description}`);
    console.log(`\nCubes (${CUBES.length}):`); for (const c of CUBES) console.log(`  ${c.id.padEnd(24)} ${c.grain.padEnd(6)} [${c.dimensions.join(", ")}] -> [${c.measures.join(", ")}]`);
    console.log(`\nComponents (${COMPONENTS.length}):`); for (const c of COMPONENTS) console.log(`  ${c.id.padEnd(18)} ${c.label.padEnd(20)} ${c.description}`);
    console.log(`\nLayouts (${LAYOUTS.length}):`); for (const l of LAYOUTS) console.log(`  ${l.id.padEnd(18)} ${l.description}`);
    console.log(`\nThemes (${THEMES.length}):`); for (const t of THEMES) console.log(`  ${t.id.padEnd(18)} ${t.mode}/${t.density.padEnd(12)} ${t.description}`);
    console.log(`\nConnectors (${CONNECTORS.length}):`); for (const c of CONNECTORS) console.log(`  ${c.id.padEnd(18)} ${c.implemented ? "implemented" : "described  "} ${c.description}`);
    return;
  }
  console.log(`usage:
  npm run generate -- "<request>" [--jev auto|mock|live|record|replay] [--out DIR] [--name NAME]
  npm run examples  [-- --jev mock]
  npm run gallery   [-- --theme daylight|midnight|boardroom|ops_dense]
  npm run catalog`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
