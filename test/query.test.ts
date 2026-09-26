import assert from "node:assert/strict";
import { test } from "node:test";
import { metricById as metric } from "../src/catalog/semantic.js";
import { SnapshotStore, bucket } from "../src/data/query.js";

const store = new SnapshotStore("data/snapshots");

test("bucket() rolls dates up to week/month/quarter starts", () => {
  assert.equal(bucket("2026-09-25", "day"), "2026-09-25");
  assert.equal(bucket("2026-09-25", "week"), "2026-09-21"); // Monday
  assert.equal(bucket("2026-09-25", "month"), "2026-09-01");
  assert.equal(bucket("2026-09-25", "quarter"), "2026-07-01");
});

test("windows are relative to the snapshot asOf date and prior windows abut", () => {
  const w = store.resolveWindow("last_30_days");
  assert.equal(w.end, store.manifest.asOf);
  const days = (new Date(w.end).getTime() - new Date(w.start).getTime()) / 86_400_000 + 1;
  assert.equal(days, 30);
  const p = store.priorWindow("last_30_days");
  assert.equal(new Date(p.end).getTime(), new Date(w.start).getTime() - 86_400_000);
});

test("resolveCube prefers the coarsest, narrowest cube that covers the request", () => {
  const revenueOnly = store.resolveCube([metric("revenue")], [], "month");
  assert.ok(revenueOnly);
  assert.equal(revenueOnly.grain, "month");
  const daily = store.resolveCube([metric("revenue")], ["category"], "day");
  assert.equal(daily?.id, "sales_daily_category");
  assert.equal(store.resolveCube([metric("customers")], [], "day"), null);
  assert.equal(store.finestGrain(["customers"], []), "month");
  assert.equal(store.finestGrain(["revenue"], ["department"]), "day");
});

test("query aggregates additively and computes ratios from sums", () => {
  const total = store.query({ metrics: ["revenue", "orders", "avg_order_value"], dimensions: [], window: "last_90_days" }).rows[0];
  const byDept = store.query({ metrics: ["revenue", "orders"], dimensions: ["department"], window: "last_90_days" }).rows;
  const sumRev = byDept.reduce((a, r) => a + Number(r.revenue), 0);
  assert.ok(Math.abs(sumRev - Number(total.revenue)) < 1, "department revenue sums to the total");
  assert.ok(Math.abs(Number(total.avg_order_value) - Number(total.revenue) / Number(total.orders)) < 0.01);
});

test("level measures roll up over time by taking the last period, not the sum", () => {
  const monthly = store.query({ metrics: ["stock_on_hand"], dimensions: [], grain: "month", window: "last_90_days" }).rows;
  const quarterly = store.query({ metrics: ["stock_on_hand"], dimensions: [], grain: "quarter", window: "last_90_days" }).rows;
  const lastMonth = monthly[monthly.length - 1];
  const lastQuarter = quarterly[quarterly.length - 1];
  assert.equal(lastQuarter.stock_on_hand, lastMonth.stock_on_hand);
});

test("topN folds the tail into Other", () => {
  const rows = store.query({ metrics: ["revenue"], dimensions: ["category"], window: "last_12_months", topN: 5 }).rows;
  assert.equal(rows.length, 6);
  assert.ok(rows.some((r) => r.category === "Other"));
});
