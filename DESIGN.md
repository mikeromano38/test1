# Design: generating dashboards with a decision model

This project tests one idea: **a dashboard is mostly a list of bounded decisions**,
and a decision model (Jev, by TypeSafe AI) can make those decisions faster, cheaper
and more auditably than a chat LLM. Text generation (titles, an insight sentence,
open-ended parameters) is a separate, later concern behind a small interface.

## 1. Why a declarative target

Jev cannot write code. It returns three answer types: a **choice** among options
it was given, a **score** on an ordered rubric, and a **noul** (a yes/no belief as
a probability). So the artefact we generate must be *assembled from a finite
library* rather than written. That rules out React/D3 code generation and favours
frameworks whose output is a JSON document:

| Candidate | Declarative? | Dashboard layout | Theming | Notes |
|---|---|---|---|---|
| **Vega-Lite** (chosen) | fully; JSON grammar of graphics | `concat`/`facet` only, no grid | `config` object | Already used by data_qna; huge surface of *parameters* Jev can pick; `vega-embed` renders from JSON |
| Apache ECharts | JSON `option` | none | `theme` object | Also viable; less principled grammar, more chart-specific knobs |
| Plotly JSON | `data` + `layout` JSON | subplots | `template` | Larger runtime; fewer composable encodings |
| Observable Plot | JS API | none | CSS | Not JSON |
| Looker Studio / Looker dashboards | LookML / API JSON | yes | limited | Needs a Looker instance; good later target for the "connector" |

Vega-Lite handles the *tiles*; a tiny dashboard spec of our own (`src/compose/spec.ts`)
handles what Vega-Lite does not: a 12-column grid, KPI tiles, tables, theme tokens,
and the decision log. The whole document is JSON; a 400-line viewer renders it.

## 2. What Jev decides, and what code decides

Rule of thumb from Jev's documentation: *retrieve and filter in code, send only what
the question needs, never ask it to count, compute or generate.* Applied here:

| Decision | Who | How |
|---|---|---|
| Dashboard archetype, time window, grain, audience, density, prior-period comparison | **Jev** (scope stage) | one choice/score/noul each |
| Which metrics and dimensions are relevant | **Jev** (fields stage) | one noul *per catalog entry* ("counting" is done in code by thresholding) |
| Headline metric, primary breakdown | **Jev** | one choice each |
| Which candidate tiles exist | code | derived from the selected fields and density caps |
| Component per tile, size per tile, importance per tile | **Jev** (tiles stage) | choice among *compatible* components only, choice of size, score of importance |
| Which tiles survive, ordering | code | importance threshold, density caps |
| Grid placement | code | first-fit packer over a 12-column grid |
| Layout template, theme preset, number format, gridlines, direct labels, sort order, connector | **Jev** (presentation stage) | one choice/noul each |
| Colour values, mark specs, legend rules | code (design system) | never generated; the palette is validated once |
| Data, aggregation, period-over-period deltas | code (query engine) | Jev never sees numbers |
| Titles, subtitles, narrative | `ParameterGenerator` | templates today; an LLM later |

Each stage is one HTTP call carrying many questions (Jev evaluates them in
parallel, so a tenth question costs tokens but no latency). The four stages are
sequential only because later questions are *built from* earlier answers.

### Confidence is part of the output

Every choice comes back with a probability distribution and a confidence value.
The pipeline records all of them in the spec (`decisions.stages[*]`), and the viewer
shows them in a side panel. This is the audit trail: you can see that "layout =
hero_focus" was chosen at 0.61 confidence over "kpi_row_grid" at 0.34, and tune
thresholds or wording accordingly. Guards in code (a stated dark preference beats
the theme choice; an unimplemented connector falls back to the static snapshot) are
recorded in the same trace with a `:override` / `:fallback` suffix.

## 3. Pipeline

```
request ─┐
         ▼
  ┌──────────────┐   state: {request}
  │ 1. scope     │   Q: archetype, time_window, grain, compare_prior, density, audience,
  └──────┬───────┘      mode_preference, wants_geo, wants_breakdowns
         ▼
  ┌──────────────┐   state: {request, dashboard_type, audience}
  │ 2. fields    │   Q: metric:<id> (noul) ×17, dimension:<id> (noul) ×12,
  └──────┬───────┘      primary_metric (choice), primary_dimension (choice)
         ▼            code: threshold ≥0.5, cap by density, keep only legal breakdowns
  ┌──────────────┐   state: {request, dashboard_type, audience, time_window, tiles:[{id, shows}]}
  │ 3. tiles     │   Q per candidate: <id>:component (choice among compatible),
  └──────┬───────┘      <id>:size (choice), <id>:importance (score 0..3)
         ▼            code: drop importance < 0.8, cap tiles, kpis first
  ┌──────────────┐   state: {request, audience, density, stated_mode_preference, tile_count, environment}
  │ 4. presentation│ Q: layout, theme, number_format, gridlines, direct_labels, sort_breakdowns, connector
  └──────┬───────┘
         ▼
  composer: query cubes → Vega-Lite per tile → pack grid → DashboardSpec (JSON)
         ▼
  viewer/index.html (vega-embed)      or      out/<name>.html (spec inlined)
```

Token budget with the mock (real Jev tokenises differently but the ratio holds):
scope ≈ 15, fields ≈ 35, tiles ≈ 90, presentation ≈ 30 input tokens. At Jev's
published price of $0.042 per million input tokens a dashboard costs a fraction
of a cent and, at 70-500 ms per call, well under two seconds of decision time.

## 4. The libraries Jev chooses from

All of these are plain data (`src/catalog/*`) so their descriptions can be
dropped into `criteria` verbatim. Descriptions are written for Jev: they say
*what job the reader is doing*, not what the marks look like, and they include the
literal phrases a request would contain ("last 12 months", "by week"), because
Jev reads instructions literally.

- **Semantic layer** (`semantic.ts`): 17 metrics, 13 dimensions, 11 cubes. A metric
  is an expression over cube measures (sum, difference, ratio, margin %). A cube
  declares its grain, dimensions and measures; the query engine picks the coarsest
  cube that covers a request and rolls it up to the requested grain. Inventory
  measures are *levels*, rolled up over time by taking the last period.
- **Components** (`components.ts`): 12 templates (stat tile, line, area, multi-line,
  small multiples, ranked bars, ordered columns, stacked bars over time, donut,
  heatmap, table, US choropleth). Each carries hard constraints (metric/dimension
  arity, time required or forbidden, max cardinality, ordered-only, geo-only) and
  a colour job. `compatible(shape)` computes the legal set; Jev only chooses among
  legal components, so a bad decision is a suboptimal chart, never a broken one.
- **Layouts** (`layouts.ts`): 4 templates expressed as packer rules (where KPIs go,
  whether chart sizes are overridden, hero promotion, tile cap).
- **Themes** (`themes.ts`): 4 presets = mode × density × type scale over two token
  sets (light, dark). Colours come from a validated palette (see §6). Independent
  toggles (number format, gridlines, direct labels, sort order) are separate
  questions so a preset never has to encode them.
- **Connectors** (`connectors.ts`): static snapshot (implemented), BigQuery live and
  CSV upload (described, so the connector *decision* can be exercised and the
  environment's constraints tested; the composer falls back when the choice is
  not implemented).

## 5. Data: static snapshots of thelook_ecommerce

`scripts/sql/*.sql` are eleven aggregation queries over
`bigquery-public-data.thelook_ecommerce` (order_items, products, users, events,
inventory_items, distribution_centers). `npm run extract` runs them through the
BigQuery REST API and writes columnar JSON cubes to `data/snapshots/` plus a
manifest with the as-of date. Cubes are pre-aggregated to day or month grain with
2 to 4 dimensions each, so the whole snapshot is a few megabytes and every tile
query is an in-memory group-by.

The committed snapshot is **synthetic placeholder data** produced by
`npm run synth`, using thelook's real vocabularies (categories, brands, channels,
warehouses, statuses) but generated numbers, because this environment has no
GCP project authorised to bill the extraction queries. Running `npm run extract`
with a project replaces it in place; nothing else changes.

## 6. Visual rules the templates enforce

From the data-viz method used across this repo: one axis per chart (never dual
axis); categorical hues in a fixed order that follows the entity, never cycled or
generated; one hue for magnitude; a legend whenever there are two or more series
and none for one; selective direct labels only when Jev turns them on; thin marks
with rounded data-ends and a surface-coloured gap between stacked segments; hairline
solid gridlines; a table view behind every chart (the viewer's "table" toggle).
The light and dark categorical palettes were run through the palette validator:
both pass the lightness band, chroma floor, adjacent-pair CVD separation (worst
ΔE 9.1 light / 8.4 dark) and normal-vision floor; three light slots are below 3:1
contrast, which the table view and direct labels relieve.

## 7. Where an LLM plugs in

`src/params/generator.ts` defines `ParameterGenerator` with two methods
(`dashboardTitle`, `tileTitle`). The default is templates. An LLM implementation
receives the *finished plan*, so its prompt is a few hundred tokens and its output
is short labels that can be length-checked. Other candidates for the same seam,
in order of value:

1. Free-text tile subtitles / one insight sentence per tile (needs numbers; the
   composer can hand it the computed deltas so the LLM only phrases them).
2. Filter defaults from the request ("for the Men's department") — extraction is
   something Jev *can* do via choice over enumerated values, so try Jev first.
3. Custom metric definitions not in the catalog — real generation; gate it behind
   a Jev noul "the request needs a metric that is not in the catalog".

## 8. Testing strategy

- `npm test` runs offline against the **mock** client (deterministic lexical
  overlap) and checks structure, not judgement: every choice has 2..255 options,
  every score 2..10 levels, plans are internally consistent, the packer never
  overlaps, every layout places every tile, every tile has exactly one payload.
- `npm run gallery` renders every component with no Jev involved, for visual
  regression of the templates.
- With `TYPESAFE_API_KEY` set, `--jev record` saves real answers to
  `fixtures/jev/` (keyed by request hash) and `--jev replay` reuses them, so
  threshold tuning is reproducible. Pin `JEV_MODEL=jev-1.13.0` when recording.

## 9. Known limits and next steps

- The mock is a placeholder judge; example outputs made with it show the *shape*
  of a run, not Jev's quality. Record real fixtures first.
- Only the static connector is implemented. A live BigQuery connector would
  compile each tile's `query` (metrics, dimensions, grain, window, filters) to
  SQL against the same semantic layer; the spec already carries the query.
- Cross-cube consistency: `orders` summed across a dimension over-counts
  multi-line orders slightly (cubes store per-group distinct counts). Fine for a
  test project; a live connector computes exact distincts.
- Interaction (cross-filtering, date-range control) is not generated yet. It is
  a natural next decision: "does the request need a date-range control?" (noul),
  "which dimension should be the global filter?" (choice).
