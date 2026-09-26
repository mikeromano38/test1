/**
 * Semantic layer over the static thelook_ecommerce snapshots.
 *
 * Jev picks *which* of these to use; the query engine (src/data/query.ts)
 * turns the picks into rows. Everything here is data, so the catalog can be
 * serialised into Jev's `state` (only the parts a question needs).
 */

export type Grain = "day" | "week" | "month" | "quarter";
export const GRAINS: Grain[] = ["day", "week", "month", "quarter"];

export type TimeWindow = "last_30_days" | "last_90_days" | "last_12_months" | "year_to_date" | "all_time";
export const TIME_WINDOWS: TimeWindow[] = ["last_30_days", "last_90_days", "last_12_months", "year_to_date", "all_time"];

export type Format = "currency" | "number" | "percent" | "days";

export interface Dimension {
  id: string;
  label: string;
  description: string;
  kind: "time" | "categorical" | "geo";
  /** rough number of distinct values; drives component compatibility */
  cardinality: number;
  /** ordered categories (age bands, funnel stages) get an ordinal ramp, not categorical hues */
  ordered?: boolean;
}

export interface Metric {
  id: string;
  label: string;
  description: string;
  format: Format;
  /** "up" = higher is better; drives delta colouring in KPI tiles */
  goodDirection: "up" | "down";
  expr:
    | { kind: "sum"; measure: string }
    | { kind: "diff"; a: string; b: string }
    | { kind: "ratio"; numerator: string; denominator: string }
    | { kind: "margin_pct"; revenue: string; cost: string };
}

export interface CubeDef {
  id: string;
  file: string;
  description: string;
  grain: "day" | "month";
  dimensions: string[]; // excluding the implicit date column
  measures: string[];
  /** measures that are *levels* (inventory) rather than flows: roll up over time by taking the last period */
  levelMeasures?: string[];
}

export const DIMENSIONS: Dimension[] = [
  { id: "date", label: "Date", description: "Order / event date", kind: "time", cardinality: 730 },
  { id: "department", label: "Department", description: "Men or Women", kind: "categorical", cardinality: 2 },
  { id: "category", label: "Product category", description: "Product category such as Jeans, Dresses, Outerwear", kind: "categorical", cardinality: 26 },
  { id: "brand", label: "Brand", description: "Product brand (top 40, rest folded into Other)", kind: "categorical", cardinality: 41 },
  { id: "order_status", label: "Order status", description: "Complete, Shipped, Processing, Cancelled, Returned", kind: "categorical", cardinality: 5 },
  { id: "traffic_source", label: "Traffic source", description: "Acquisition channel: Search, Organic, Facebook, Email, Display", kind: "categorical", cardinality: 5 },
  { id: "gender", label: "Customer gender", description: "Customer gender M/F", kind: "categorical", cardinality: 2 },
  { id: "age_band", label: "Customer age band", description: "Customer age band: under 25, 25-34, 35-44, 45-54, 55+", kind: "categorical", cardinality: 5, ordered: true },
  { id: "country", label: "Country", description: "Customer country", kind: "geo", cardinality: 8 },
  { id: "state", label: "US state", description: "Customer US state (for maps)", kind: "geo", cardinality: 51 },
  { id: "event_type", label: "Web event type", description: "Website event: home, department, product, cart, purchase, cancel", kind: "categorical", cardinality: 6, ordered: true },
  { id: "browser", label: "Browser", description: "Visitor browser", kind: "categorical", cardinality: 5 },
  { id: "distribution_center", label: "Distribution center", description: "Fulfilment warehouse (10 US cities)", kind: "categorical", cardinality: 10 },
];

export const METRICS: Metric[] = [
  { id: "revenue", label: "Revenue", description: "Sum of item sale prices (gross sales)", format: "currency", goodDirection: "up", expr: { kind: "sum", measure: "revenue" } },
  { id: "orders", label: "Orders", description: "Number of orders", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "orders" } },
  { id: "items_sold", label: "Items sold", description: "Number of order line items", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "items" } },
  { id: "gross_margin", label: "Gross margin", description: "Revenue minus product cost", format: "currency", goodDirection: "up", expr: { kind: "diff", a: "revenue", b: "cost" } },
  { id: "gross_margin_pct", label: "Gross margin %", description: "Gross margin as a share of revenue", format: "percent", goodDirection: "up", expr: { kind: "margin_pct", revenue: "revenue", cost: "cost" } },
  { id: "avg_order_value", label: "Average order value", description: "Revenue per order", format: "currency", goodDirection: "up", expr: { kind: "ratio", numerator: "revenue", denominator: "orders" } },
  { id: "return_rate", label: "Return rate", description: "Share of items returned", format: "percent", goodDirection: "down", expr: { kind: "ratio", numerator: "returned_items", denominator: "items" } },
  { id: "customers", label: "Customers", description: "Distinct purchasing customers", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "customers" } },
  { id: "new_users", label: "New signups", description: "New user accounts created", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "new_users" } },
  { id: "sessions", label: "Sessions", description: "Website sessions", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "sessions" } },
  { id: "events", label: "Web events", description: "Website page events", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "events" } },
  { id: "conversion_rate", label: "Conversion rate", description: "Purchase events per session", format: "percent", goodDirection: "up", expr: { kind: "ratio", numerator: "purchases", denominator: "sessions" } },
  { id: "cart_abandonment", label: "Cart adds", description: "Add-to-cart events", format: "number", goodDirection: "up", expr: { kind: "sum", measure: "cart_adds" } },
  { id: "stock_on_hand", label: "Stock on hand", description: "Inventory units currently unsold", format: "number", goodDirection: "down", expr: { kind: "sum", measure: "stock_on_hand" } },
  { id: "inventory_cost", label: "Inventory value", description: "Cost value of unsold inventory", format: "currency", goodDirection: "down", expr: { kind: "sum", measure: "inventory_cost" } },
  { id: "avg_days_to_ship", label: "Days to ship", description: "Average days from order to shipment", format: "days", goodDirection: "down", expr: { kind: "ratio", numerator: "ship_days_total", denominator: "shipped_count" } },
  { id: "avg_days_to_deliver", label: "Days to deliver", description: "Average days from order to delivery", format: "days", goodDirection: "down", expr: { kind: "ratio", numerator: "delivery_days_total", denominator: "delivered_count" } },
];

export const CUBES: CubeDef[] = [
  { id: "sales_daily_dept", file: "sales_daily_dept.json", description: "Daily sales by department and order status", grain: "day", dimensions: ["department", "order_status"], measures: ["revenue", "cost", "items", "orders", "returned_items"] },
  { id: "sales_daily_category", file: "sales_daily_category.json", description: "Daily sales by product category and department", grain: "day", dimensions: ["category", "department"], measures: ["revenue", "cost", "items", "orders", "returned_items"] },
  { id: "sales_monthly_brand", file: "sales_monthly_brand.json", description: "Monthly sales by brand and department", grain: "month", dimensions: ["brand", "department"], measures: ["revenue", "cost", "items", "orders"] },
  { id: "sales_monthly_geo", file: "sales_monthly_geo.json", description: "Monthly sales by customer country and US state", grain: "month", dimensions: ["country", "state"], measures: ["revenue", "orders", "items", "customers"] },
  { id: "sales_monthly_customer", file: "sales_monthly_customer.json", description: "Monthly sales by customer gender, age band and traffic source", grain: "month", dimensions: ["gender", "age_band", "traffic_source"], measures: ["revenue", "orders", "items", "customers"] },
  { id: "users_monthly", file: "users_monthly.json", description: "Monthly new signups by channel, gender, age band and country", grain: "month", dimensions: ["traffic_source", "gender", "age_band", "country"], measures: ["new_users"] },
  { id: "web_daily", file: "web_daily.json", description: "Daily web sessions and funnel events by traffic source", grain: "day", dimensions: ["traffic_source"], measures: ["sessions", "events", "purchases", "cart_adds"] },
  { id: "web_monthly_browser", file: "web_monthly_browser.json", description: "Monthly web sessions by browser", grain: "month", dimensions: ["browser"], measures: ["sessions", "events", "purchases", "cart_adds"] },
  { id: "events_monthly_type", file: "events_monthly_type.json", description: "Monthly web events by event type and traffic source", grain: "month", dimensions: ["event_type", "traffic_source"], measures: ["events"] },
  { id: "inventory_monthly", file: "inventory_monthly.json", description: "Month-end inventory by distribution center and category", grain: "month", dimensions: ["distribution_center", "category"], measures: ["stock_on_hand", "inventory_cost"], levelMeasures: ["stock_on_hand", "inventory_cost"] },
  { id: "fulfillment_daily", file: "fulfillment_daily.json", description: "Daily fulfilment timings by distribution center", grain: "day", dimensions: ["distribution_center"], measures: ["orders", "shipped_count", "ship_days_total", "delivered_count", "delivery_days_total"] },
];

export const metricById = (id: string): Metric => {
  const m = METRICS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown metric ${id}`);
  return m;
};
export const dimensionById = (id: string): Dimension => {
  const d = DIMENSIONS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dimension ${id}`);
  return d;
};

/** Measures a metric's expression reads. */
export function measuresOf(m: Metric): string[] {
  switch (m.expr.kind) {
    case "sum": return [m.expr.measure];
    case "diff": return [m.expr.a, m.expr.b];
    case "ratio": return [m.expr.numerator, m.expr.denominator];
    case "margin_pct": return [m.expr.revenue, m.expr.cost];
  }
}

/** Dimensions a metric can be broken down by (those present on some cube that carries its measures). */
export function dimensionsFor(metric: Metric): string[] {
  const need = measuresOf(metric);
  const dims = new Set<string>();
  for (const c of CUBES) if (need.every((x) => c.measures.includes(x))) c.dimensions.forEach((d) => dims.add(d));
  return [...dims];
}

export const GRAIN_ORDER: Record<Grain, number> = { day: 0, week: 1, month: 2, quarter: 3 };
