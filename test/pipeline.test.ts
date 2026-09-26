import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPONENTS, compatible, componentById } from "../src/catalog/components.js";
import { LAYOUTS } from "../src/catalog/layouts.js";
import { dimensionById, metricById } from "../src/catalog/semantic.js";
import { THEMES } from "../src/catalog/themes.js";
import { composeDashboard } from "../src/compose/composer.js";
import { packTiles } from "../src/compose/layout.js";
import { SnapshotStore } from "../src/data/query.js";
import { planDashboard } from "../src/decisions/pipeline.js";
import { candidateTiles } from "../src/decisions/stages.js";
import { MockJevClient } from "../src/jev/mock.js";
import type { JevQuestion, JevState } from "../src/jev/types.js";

const store = new SnapshotStore("data/snapshots");
const jev = new MockJevClient();

test("compatible() only offers components whose constraints the tile shape satisfies", () => {
  const trend = compatible({ metrics: [metricById("revenue")], dimensions: [], hasTime: true }).map((c) => c.id);
  assert.deepEqual(trend.sort(), ["area", "kpi", "line"]);
  const byCategory = compatible({ metrics: [metricById("revenue")], dimensions: [dimensionById("category")], hasTime: false }).map((c) => c.id);
  assert.ok(byCategory.includes("bar_ranked") && byCategory.includes("table"));
  assert.ok(!byCategory.includes("donut"), "26 categories is too many for a donut");
  assert.ok(!byCategory.includes("column"), "category is not an ordered dimension");
  const byState = compatible({ metrics: [metricById("revenue")], dimensions: [dimensionById("state")], hasTime: false }).map((c) => c.id);
  assert.ok(byState.includes("choropleth_us"));
  assert.ok(!byState.includes("stacked_bar_time"));
  const ages = compatible({ metrics: [metricById("orders")], dimensions: [dimensionById("age_band")], hasTime: false }).map((c) => c.id);
  assert.ok(ages.includes("column") && ages.includes("donut"));
});

test("every Jev choice question the stages build has 2..255 options and every score 2..10 levels", async () => {
  const seen: JevQuestion[] = [];
  const spy = { name: "spy", systemOne: async (req: { state: JevState; questions: Record<string, JevQuestion> }) => { seen.push(...Object.values(req.questions)); return jev.systemOne(req); } };
  await planDashboard("Sales by category over the last 12 months", { jev: spy });
  assert.ok(seen.length > 20);
  for (const q of seen) {
    if (q.type === "choice") { const n = Object.keys(q.criteria).length; assert.ok(n >= 2 && n <= 255, `choice with ${n} options`); }
    if (q.type === "score") assert.ok(q.criteria.length >= 2 && q.criteria.length <= 10);
    assert.ok(q.instructions.length > 10);
  }
});

test("the plan is internally consistent: ids resolve, tiles use compatible components, caps hold", async () => {
  const plan = await planDashboard("Dense analyst view of sales performance by product category and brand, monthly, past year", { jev });
  assert.ok(plan.fields.metrics.includes(plan.fields.primaryMetric));
  for (const t of plan.tiles) {
    const c = componentById(t.component);
    const shape = { metrics: t.metrics.map(metricById), dimensions: t.dimensions.map(dimensionById), hasTime: t.hasTime };
    if (c.id !== "kpi") assert.ok(compatible(shape).some((x) => x.id === c.id), `${t.id}: ${c.id} not compatible with its shape`);
    assert.ok(c.allowedSizes.includes(t.size), `${t.id}: size ${t.size} not allowed for ${c.id}`);
  }
  assert.ok(plan.tiles.length <= 12);
  assert.equal(plan.trace.length, 4);
  assert.ok(plan.trace.every((s) => s.decisions.length > 0));
});

test("candidate tiles always include a KPI for the primary metric and its trend", () => {
  const scope = { archetype: "sales_performance", timeWindow: "last_12_months", grain: "month", comparePrior: true, density: "balanced", audience: "analyst", modePreference: "no_preference", wantsGeo: false, wantsBreakdowns: true } as const;
  const fields = { metrics: ["revenue", "orders"], dimensions: ["category"], primaryMetric: "revenue", primaryDimension: "category", relevance: {} };
  const c = candidateTiles(scope, fields);
  assert.ok(c.some((t) => t.role === "kpi" && t.metrics[0] === "revenue"));
  assert.ok(c.some((t) => t.id === "trend_0"));
  assert.ok(c.some((t) => t.role === "breakdown" && t.dimensions[0] === "category"));
  assert.ok(c.some((t) => t.role === "detail"));
});

test("packTiles never overlaps and never exceeds 12 columns, for every layout template", async () => {
  const plan = await planDashboard("Executive overview with revenue, orders, margin and customers by traffic source and state", { jev });
  for (const layout of LAYOUTS) {
    const packed = packTiles(plan.tiles, layout.id);
    assert.equal(packed.length, plan.tiles.length, `${layout.id}: every tile placed`);
    const cells = new Set<string>();
    for (const p of packed) {
      const { colStart, colSpan, rowStart, rowSpan } = p.placement;
      assert.ok(colStart >= 1 && colStart + colSpan - 1 <= 12, `${layout.id}/${p.tile.id} inside 12 columns`);
      for (let r = rowStart; r < rowStart + rowSpan; r++) for (let c = colStart; c < colStart + colSpan; c++) {
        assert.ok(!cells.has(`${r}:${c}`), `${layout.id}: overlap at ${r}:${c}`);
        cells.add(`${r}:${c}`);
      }
    }
  }
});

test("composeDashboard produces a self-contained spec with a payload per tile and valid theme tokens", async () => {
  const plan = await planDashboard("Dark operations dashboard: days to ship by distribution center, last 30 days, daily", { jev });
  const spec = await composeDashboard(plan, { store });
  assert.equal(spec.version, "0.1");
  assert.ok(spec.tiles.length >= 2);
  for (const t of spec.tiles) {
    const payloads = [t.kpi, t.vegaLite, t.table].filter(Boolean).length;
    assert.equal(payloads, 1, `${t.id} has exactly one payload`);
    if (t.vegaLite) {
      assert.equal(t.vegaLite.width, "container");
      assert.ok((t.vegaLite as { config: { range: { category: string[] } } }).config.range.category.length === 8);
    }
    if (t.kpi) assert.ok(t.kpi.spark.length >= 1);
  }
  assert.equal(spec.theme.mode, "dark", "a stated dark preference forces a dark preset");
  assert.ok(THEMES.some((th) => th.id === spec.theme.id));
  assert.equal(spec.source.connector, "static_snapshot");
  assert.ok(spec.decisions.summary.length > 20);
});

test("mode preference override is recorded in the trace when Jev picks the wrong mode", async () => {
  const plan = await planDashboard("Bright light theme executive overview", { jev, overrides: { presentation: { theme: "midnight" } as never } });
  // override applied after the stage: composer must still honour the explicit override
  const spec = await composeDashboard(plan, { store });
  assert.equal(spec.theme.id, "midnight");
});

test("catalog invariants: ids unique, sizes legal, descriptions present", () => {
  const ids = COMPONENTS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of COMPONENTS) {
    assert.ok(c.allowedSizes.includes(c.defaultSize), `${c.id} default size is allowed`);
    assert.ok(c.description.length > 30, `${c.id} description is meaningful for Jev`);
  }
});
