/**
 * Connectors. Only the static snapshot connector is implemented; the others
 * are described so Jev can be asked to choose between them, and the composer
 * records the choice on the spec (a live connector would compile the same
 * tile queries to SQL against thelook_ecommerce instead of reading cubes).
 */
export interface ConnectorDef {
  id: string;
  label: string;
  description: string;
  implemented: boolean;
}

export const CONNECTORS: ConnectorDef[] = [
  { id: "static_snapshot", label: "Static snapshot", description: "Pre-aggregated JSON cubes extracted from BigQuery and embedded in the dashboard. Works offline, no credentials, data as of the snapshot date.", implemented: true },
  { id: "bigquery_live", label: "BigQuery live", description: "Run each tile's query against bigquery-public-data.thelook_ecommerce at view time. Always current, needs a billable GCP project and credentials.", implemented: false },
  { id: "csv_upload", label: "CSV upload", description: "The viewer supplies a CSV export matching the cube schema. For sharing a dashboard with people who lack warehouse access.", implemented: false },
];
