/**
 * Pull the static snapshot cubes from BigQuery's public thelook_ecommerce
 * dataset. Runs every scripts/sql/<cube>.sql through the BigQuery REST API
 * (no client library needed) and writes columnar JSON into data/snapshots.
 *
 *   GCP_PROJECT=<billable project id> \
 *   GCP_ACCESS_TOKEN=$(gcloud auth print-access-token) \
 *   npm run extract
 *
 * The public dataset is free to read, but the query job is billed to
 * GCP_PROJECT (well inside BigQuery's free monthly tier for these queries).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CUBES } from "../src/catalog/semantic.js";

const project = process.env.GCP_PROJECT;
const token = process.env.GCP_ACCESS_TOKEN;
if (!project || !token) {
  console.error("Set GCP_PROJECT and GCP_ACCESS_TOKEN (e.g. $(gcloud auth print-access-token)).");
  process.exit(1);
}
const outDir = process.env.SNAPSHOT_DIR ?? "data/snapshots";
mkdirSync(outDir, { recursive: true });

interface QueryResponse {
  jobComplete: boolean;
  jobReference?: { jobId: string; location?: string };
  schema?: { fields: { name: string; type: string }[] };
  rows?: { f: { v: unknown }[] }[];
  pageToken?: string;
  totalRows?: string;
  errors?: unknown[];
}

async function bq(path: string, init: RequestInit): Promise<QueryResponse> {
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`BigQuery ${path}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as QueryResponse;
}

async function runSql(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  let page = await bq("/queries", { method: "POST", body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 60_000, maxResults: 50_000 }) });
  const job = page.jobReference!;
  while (!page.jobComplete) {
    await new Promise((r) => setTimeout(r, 2000));
    page = await bq(`/queries/${job.jobId}?location=${job.location ?? "US"}&maxResults=50000`, { method: "GET" });
  }
  const fields = page.schema!.fields;
  const columns = fields.map((f) => f.name);
  const rows: unknown[][] = [];
  for (;;) {
    for (const r of page.rows ?? []) rows.push(r.f.map((cell, i) => coerce(cell.v, fields[i].type)));
    if (!page.pageToken) break;
    page = await bq(`/queries/${job.jobId}?location=${job.location ?? "US"}&maxResults=50000&pageToken=${page.pageToken}`, { method: "GET" });
  }
  return { columns, rows };
}

function coerce(v: unknown, type: string): unknown {
  if (v === null || v === undefined) return null;
  if (type === "INTEGER" || type === "INT64" || type === "FLOAT" || type === "FLOAT64" || type === "NUMERIC") return Number(v);
  return v;
}

let asOf = "";
const manifestCubes: { id: string; file: string; rows: number }[] = [];
for (const cube of CUBES) {
  const sql = readFileSync(join("scripts/sql", `${cube.id}.sql`), "utf8");
  process.stdout.write(`${cube.id} ... `);
  const { columns, rows } = await runSql(sql);
  const dateIdx = columns.indexOf("date");
  if (cube.grain === "day") for (const r of rows) if ((r[dateIdx] as string) > asOf) asOf = r[dateIdx] as string;
  writeFileSync(join(outDir, cube.file), JSON.stringify({ id: cube.id, grain: cube.grain, columns, rows }));
  manifestCubes.push({ id: cube.id, file: cube.file, rows: rows.length });
  console.log(`${rows.length} rows`);
}
writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify({ source: "bigquery-public-data.thelook_ecommerce", dataset: "thelook_ecommerce", asOf, generatedAt: new Date().toISOString(), cubes: manifestCubes }, null, 2),
);
console.log(`wrote ${manifestCubes.length} cubes to ${outDir}, asOf=${asOf}`);
