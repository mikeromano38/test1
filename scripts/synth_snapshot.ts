/**
 * PLACEHOLDER DATA. Generates snapshot cubes with exactly the schema that
 * scripts/extract_thelook.ts produces from bigquery-public-data.thelook_ecommerce,
 * using thelook's real category / brand / channel / warehouse vocabularies but
 * synthetic numbers. Run `npm run extract` with a billable GCP project to
 * replace it with the real snapshot; nothing else in the project changes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CUBES } from "../src/catalog/semantic.js";

const outDir = process.env.SNAPSHOT_DIR ?? "data/snapshots";
const AS_OF = process.env.AS_OF ?? "2026-09-25";
const START_DAYS = 730;
mkdirSync(outDir, { recursive: true });

/* ---------- thelook vocabularies ---------- */
const CATEGORIES: [string, string, number][] = [
  ["Accessories", "Women", 3], ["Active", "Women", 3], ["Blazers & Jackets", "Women", 2], ["Clothing Sets", "Women", 1],
  ["Dresses", "Women", 5], ["Fashion Hoodies & Sweatshirts", "Women", 4], ["Intimates", "Women", 5], ["Jeans", "Women", 6],
  ["Jumpsuits & Rompers", "Women", 1], ["Leggings", "Women", 2], ["Maternity", "Women", 2], ["Outerwear & Coats", "Women", 4],
  ["Pants & Capris", "Women", 3], ["Plus", "Women", 2], ["Shorts", "Women", 3], ["Skirts", "Women", 2], ["Sleep & Lounge", "Women", 3],
  ["Socks & Hosiery", "Women", 2], ["Suits", "Women", 1], ["Sweaters", "Women", 4], ["Swim", "Women", 3], ["Tops & Tees", "Women", 6],
  ["Accessories", "Men", 3], ["Active", "Men", 3], ["Fashion Hoodies & Sweatshirts", "Men", 4], ["Jeans", "Men", 6], ["Outerwear & Coats", "Men", 5],
  ["Pants", "Men", 4], ["Shorts", "Men", 3], ["Sleep & Lounge", "Men", 2], ["Socks", "Men", 2], ["Suits & Sport Coats", "Men", 2],
  ["Sweaters", "Men", 4], ["Swim", "Men", 2], ["Tops & Tees", "Men", 6], ["Underwear", "Men", 4],
];
const BRANDS = ["Allegra K", "Calvin Klein", "Carhartt", "Hanes", "Volcom", "Nautica", "Quiksilver", "Diesel", "Levi's", "Dockers",
  "Tommy Hilfiger", "Columbia", "Wrangler", "Oakley", "Puma", "Champion", "7 For All Mankind", "True Religion", "Lucky Brand", "Speedo",
  "Under Armour", "Nike", "Adidas", "Jockey", "Fruit of the Loom", "Gildan", "Dickies", "Ray-Ban", "Hurley", "Billabong",
  "Lee", "Pendleton", "Woolrich", "Patagonia", "The North Face", "Marmot", "Ralph Lauren", "Michael Kors", "Lacoste", "Ben Sherman", "Other"];
const STATUSES: [string, number][] = [["Complete", 25], ["Shipped", 30], ["Processing", 20], ["Cancelled", 15], ["Returned", 10]];
const TRAFFIC: [string, number][] = [["Search", 70], ["Organic", 15], ["Facebook", 6], ["Email", 5], ["Display", 4]];
const GENDERS: [string, number][] = [["F", 50], ["M", 50]];
const AGE_BANDS: [string, number][] = [["Under 25", 20], ["25-34", 18], ["35-44", 18], ["45-54", 18], ["55+", 26]];
const COUNTRIES: [string, number][] = [["United States", 22], ["China", 34], ["Brasil", 15], ["South Korea", 5], ["France", 5], ["United Kingdom", 4], ["Germany", 4], ["Spain", 3], ["Other", 8]];
const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");
const STATE_NAMES: Record<string, string> = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia" };
const STATE_WEIGHT: Record<string, number> = { CA: 12, TX: 9, FL: 7, NY: 6, PA: 4, IL: 4, OH: 4, GA: 3, NC: 3, MI: 3 };
const DCS = ["Memphis TN", "Chicago IL", "Houston TX", "Los Angeles CA", "New Orleans LA", "Port Authority of New York/New Jersey NY/NJ", "Philadelphia PA", "Mobile AL", "Charleston SC", "Savannah GA"];
const EVENT_TYPES: [string, number][] = [["home", 20], ["department", 25], ["product", 25], ["cart", 15], ["purchase", 8], ["cancel", 7]];
const BROWSERS: [string, number][] = [["Chrome", 50], ["Safari", 20], ["Firefox", 15], ["IE", 10], ["Other", 5]];

/* ---------- deterministic RNG ---------- */
let seed = 20260925;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const jitter = (x: number, pct = 0.12) => x * (1 + (rand() * 2 - 1) * pct);
const gauss = () => { const u = rand() || 1e-9, v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ---------- calendar ---------- */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const end = new Date(AS_OF + "T00:00:00Z");
const days: string[] = [];
for (let i = START_DAYS - 1; i >= 0; i--) { const d = new Date(end); d.setUTCDate(d.getUTCDate() - i); days.push(iso(d)); }
const months = [...new Set(days.map((d) => d.slice(0, 7) + "-01"))];

/** base demand in items/day: growth + weekly pattern + holiday season */
function demand(date: string): number {
  const d = new Date(date + "T00:00:00Z");
  const t = (d.getTime() - new Date(days[0] + "T00:00:00Z").getTime()) / 86_400_000;
  const growth = 260 * (1 + 0.35 * (t / START_DAYS));
  const dow = d.getUTCDay();
  const weekly = dow === 0 || dow === 6 ? 1.18 : dow === 1 ? 0.92 : 1;
  const m = d.getUTCMonth();
  const season = m === 10 ? 1.25 : m === 11 ? 1.4 : m === 0 ? 0.85 : m === 6 ? 1.08 : 1;
  return growth * weekly * season * (1 + 0.08 * gauss());
}

const split = <T,>(total: number, weights: [T, number][]): [T, number][] => {
  const sum = weights.reduce((a, [, w]) => a + w, 0);
  return weights.map(([k, w]) => [k, Math.max(0, Math.round(jitter((total * w) / sum, 0.2)))]);
};
const unitPrice = 62, unitCost = 30, unitOrders = 0.72;
const money = (x: number) => Math.round(x * 100) / 100;

type Table = { columns: string[]; rows: unknown[][] };
const tables: Record<string, Table> = {};
const table = (id: string, columns: string[]): Table => (tables[id] = { columns, rows: [] as unknown[][] });

/* sales_daily_dept */
{
  const t = table("sales_daily_dept", ["date", "department", "order_status", "revenue", "cost", "items", "orders", "returned_items"]);
  for (const date of days) {
    const total = demand(date);
    for (const [dept, dItems] of split(total, [["Women", 55], ["Men", 45]])) {
      for (const [status, items] of split(dItems, STATUSES)) {
        if (!items) continue;
        const returned = status === "Returned" ? items : Math.round(items * 0.02 * rand());
        t.rows.push([date, dept, status, money(jitter(items * unitPrice)), money(jitter(items * unitCost)), items, Math.max(1, Math.round(items * unitOrders)), returned]);
      }
    }
  }
}
/* sales_daily_category */
{
  const t = table("sales_daily_category", ["date", "category", "department", "revenue", "cost", "items", "orders", "returned_items"]);
  for (const date of days) {
    const total = demand(date);
    const m = new Date(date + "T00:00:00Z").getUTCMonth();
    const weights: [string, number][] = CATEGORIES.map(([c, d, w]) => {
      let ww = w;
      if (c === "Swim" || c === "Shorts") ww *= m >= 4 && m <= 7 ? 1.9 : 0.5;
      if (c === "Outerwear & Coats" || c === "Sweaters") ww *= m >= 9 || m <= 1 ? 1.8 : 0.55;
      return [`${c}|${d}`, ww];
    });
    for (const [key, items] of split(total, weights)) {
      if (!items) continue;
      const [cat, dept] = key.split("|");
      const price = cat === "Outerwear & Coats" ? 110 : cat === "Suits" || cat === "Suits & Sport Coats" ? 140 : cat === "Socks" || cat === "Socks & Hosiery" ? 14 : cat === "Jeans" ? 75 : unitPrice;
      t.rows.push([date, cat, dept, money(jitter(items * price)), money(jitter(items * price * 0.48)), items, Math.max(1, Math.round(items * unitOrders)), Math.round(items * 0.1 * rand())]);
    }
  }
}
/* monthly helpers */
const monthDemand = (month: string) => days.filter((d) => d.startsWith(month.slice(0, 7))).reduce((a, d) => a + demand(d), 0);

/* sales_monthly_brand */
{
  const t = table("sales_monthly_brand", ["date", "brand", "department", "revenue", "cost", "items", "orders"]);
  const bw: [string, number][] = BRANDS.map((b, i) => [b, b === "Other" ? 40 : 12 - (i % 9)]);
  for (const month of months) {
    const total = monthDemand(month);
    for (const [dept, dItems] of split(total, [["Women", 55], ["Men", 45]])) {
      for (const [brand, items] of split(dItems, bw)) {
        if (!items) continue;
        t.rows.push([month, brand, dept, money(jitter(items * unitPrice)), money(jitter(items * unitCost)), items, Math.max(1, Math.round(items * unitOrders))]);
      }
    }
  }
}
/* sales_monthly_geo */
{
  const t = table("sales_monthly_geo", ["date", "country", "state", "revenue", "orders", "items", "customers"]);
  const sw: [string, number][] = US_STATES.map((s) => [s, STATE_WEIGHT[s] ?? 1]);
  for (const month of months) {
    const total = monthDemand(month);
    for (const [country, cItems] of split(total, COUNTRIES)) {
      if (country === "United States") {
        for (const [st, items] of split(cItems, sw)) {
          if (!items) continue;
          const orders = Math.max(1, Math.round(items * unitOrders));
          t.rows.push([month, country, STATE_NAMES[st], money(jitter(items * unitPrice)), orders, items, Math.round(orders * 0.85)]);
        }
      } else if (cItems) {
        const orders = Math.max(1, Math.round(cItems * unitOrders));
        t.rows.push([month, country, null, money(jitter(cItems * unitPrice)), orders, cItems, Math.round(orders * 0.85)]);
      }
    }
  }
}
/* sales_monthly_customer */
{
  const t = table("sales_monthly_customer", ["date", "gender", "age_band", "traffic_source", "revenue", "orders", "items", "customers"]);
  for (const month of months) {
    const total = monthDemand(month);
    for (const [g, gi] of split(total, GENDERS)) for (const [a, ai] of split(gi, AGE_BANDS)) for (const [ts, items] of split(ai, TRAFFIC)) {
      if (!items) continue;
      const orders = Math.max(1, Math.round(items * unitOrders));
      t.rows.push([month, g, a, ts, money(jitter(items * unitPrice)), orders, items, Math.round(orders * 0.85)]);
    }
  }
}
/* users_monthly */
{
  const t = table("users_monthly", ["date", "traffic_source", "gender", "age_band", "country", "new_users"]);
  for (const month of months) {
    const total = monthDemand(month) * 0.45;
    for (const [ts, ti] of split(total, TRAFFIC)) for (const [g, gi] of split(ti, GENDERS)) for (const [a, ai] of split(gi, AGE_BANDS)) for (const [c, n] of split(ai, COUNTRIES)) {
      if (n) t.rows.push([month, ts, g, a, c, n]);
    }
  }
}
/* web_daily */
{
  const t = table("web_daily", ["date", "traffic_source", "sessions", "events", "purchases", "cart_adds"]);
  for (const date of days) {
    const sessionsTotal = demand(date) * 6.5;
    for (const [ts, sessions] of split(sessionsTotal, TRAFFIC)) {
      if (!sessions) continue;
      const conv = ts === "Email" ? 0.055 : ts === "Search" ? 0.032 : 0.025;
      t.rows.push([date, ts, sessions, Math.round(sessions * jitter(3.4)), Math.round(sessions * jitter(conv)), Math.round(sessions * jitter(0.14))]);
    }
  }
}
/* web_monthly_browser */
{
  const t = table("web_monthly_browser", ["date", "browser", "sessions", "events", "purchases", "cart_adds"]);
  for (const month of months) {
    const sessionsTotal = monthDemand(month) * 6.5;
    for (const [b, sessions] of split(sessionsTotal, BROWSERS)) {
      if (sessions) t.rows.push([month, b, sessions, Math.round(sessions * jitter(3.4)), Math.round(sessions * jitter(0.031)), Math.round(sessions * jitter(0.14))]);
    }
  }
}
/* events_monthly_type */
{
  const t = table("events_monthly_type", ["date", "event_type", "traffic_source", "events"]);
  for (const month of months) {
    const eventsTotal = monthDemand(month) * 6.5 * 3.4;
    for (const [ts, ti] of split(eventsTotal, TRAFFIC)) for (const [et, n] of split(ti, EVENT_TYPES)) if (n) t.rows.push([month, et, ts, n]);
  }
}
/* inventory_monthly */
{
  const t = table("inventory_monthly", ["date", "distribution_center", "category", "stock_on_hand", "inventory_cost"]);
  const cats = [...new Set(CATEGORIES.map(([c]) => c))];
  const base: Record<string, number> = {};
  for (const dc of DCS) for (const c of cats) base[`${dc}|${c}`] = 120 + rand() * 900;
  for (const [i, month] of months.entries()) {
    for (const dc of DCS) for (const c of cats) {
      const stock = Math.round(base[`${dc}|${c}`] * (1 + 0.25 * (i / months.length)) * (1 + 0.15 * gauss()));
      t.rows.push([month, dc, c, Math.max(0, stock), money(Math.max(0, stock) * jitter(28))]);
    }
  }
}
/* fulfillment_daily */
{
  const t = table("fulfillment_daily", ["date", "distribution_center", "orders", "shipped_count", "ship_days_total", "delivered_count", "delivery_days_total"]);
  const dw: [string, number][] = DCS.map((d, i) => [d, 14 - i]);
  for (const date of days) {
    const orders = demand(date) * unitOrders;
    for (const [dc, n] of split(orders, dw)) {
      if (!n) continue;
      const shipped = Math.round(n * 0.75), delivered = Math.round(n * 0.55);
      const shipDays = dc.startsWith("Port") ? 2.6 : dc === "Houston TX" ? 1.6 : 2.0;
      t.rows.push([date, dc, n, shipped, money(shipped * jitter(shipDays, 0.2)), delivered, money(delivered * jitter(shipDays + 2.4, 0.2))]);
    }
  }
}

/* ---------- write ---------- */
const manifestCubes = [];
for (const cube of CUBES) {
  const t = tables[cube.id];
  if (!t) throw new Error(`synth: no generator for cube ${cube.id}`);
  for (const m of cube.measures) if (!t.columns.includes(m)) throw new Error(`synth: cube ${cube.id} missing measure ${m}`);
  for (const d of cube.dimensions) if (!t.columns.includes(d)) throw new Error(`synth: cube ${cube.id} missing dimension ${d}`);
  writeFileSync(join(outDir, cube.file), JSON.stringify({ id: cube.id, grain: cube.grain, columns: t.columns, rows: t.rows }));
  manifestCubes.push({ id: cube.id, file: cube.file, rows: t.rows.length });
  console.log(`${cube.id}: ${t.rows.length} rows`);
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify({
  source: "synthetic-placeholder (thelook_ecommerce schema; replace with `npm run extract`)",
  dataset: "thelook_ecommerce",
  asOf: AS_OF,
  generatedAt: new Date().toISOString(),
  cubes: manifestCubes,
}, null, 2));
