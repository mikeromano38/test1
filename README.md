# jev-dashboard-generator

A test project for generating dashboards with **Jev**, TypeSafe AI's decision
model, from a library of pre-existing components, layouts, themes and connectors,
over static snapshots of BigQuery's public `thelook_ecommerce` dataset.

Jev never writes code or text. It answers typed questions (choice / score /
yes-no belief) about a request; code turns those answers into a declarative
dashboard spec whose tiles are Vega-Lite JSON. See [DESIGN.md](DESIGN.md) for the
reasoning and the full decision graph.

## Quick start

```bash
npm install
npm test                                   # offline, uses the deterministic mock
npm run generate -- "Executive overview of the last 12 months, monthly, compared to prior period"
npm run serve                              # then open http://localhost:8787/viewer/?spec=/out/dashboard.json
```

`npm run generate` also writes `out/dashboard.html`, a standalone page with the
spec inlined (it loads Vega from a CDN).

With a Jev API key the same commands use the real model:

```bash
export TYPESAFE_API_KEY=...                # optional: JEV_MODEL=jev-1.13.0 to pin
npm run generate -- --jev live "Dark ops dashboard: days to ship by warehouse, last 30 days"
npm run generate -- --jev record "..."     # saves answers under fixtures/jev/
npm run generate -- --jev replay "..."     # replays them offline
```

Other commands:

```bash
npm run examples          # six canned requests -> examples/*.{json,html}
npm run gallery           # every component template on one page (no Jev) -> out/gallery_daylight.html
npm run gallery -- --theme midnight
npm run catalog           # print the metrics, dimensions, cubes, components, layouts, themes, connectors
npm run typecheck
```

## Data

`data/snapshots/` holds eleven pre-aggregated cubes (columnar JSON) plus a
manifest. **The committed snapshot is synthetic placeholder data** with
thelook's real vocabularies; replace it with the real extract:

```bash
GCP_PROJECT=<billable project> GCP_ACCESS_TOKEN=$(gcloud auth print-access-token) npm run extract
```

The queries are in `scripts/sql/` (one per cube) and run against
`bigquery-public-data.thelook_ecommerce`.

## Layout of the code

```
src/jev/          Jev API types, HTTP client (fetch, retries), deterministic mock, record/replay
src/catalog/      semantic layer, components, layouts, themes, connectors  (all plain data)
src/decisions/    the four Jev stages and the pipeline that runs them; Plan + trace types
src/data/         snapshot store + in-memory cube query engine (window, grain rollup, top-N)
src/compose/      Vega-Lite templates, grid packer, composer -> DashboardSpec
src/params/       ParameterGenerator seam (templates now; LLM later)
src/cli.ts        generate / examples / gallery / catalog
viewer/           spec renderer (vega-embed) with table views and a decision log panel
scripts/          extract (BigQuery REST), synth (placeholder data), serve
test/             node:test suites (query engine, pipeline, packer, composer)
```
