import type { TileSize } from "../catalog/components.js";
import type { Grain, TimeWindow } from "../catalog/semantic.js";
import type { PresentationOptions } from "../catalog/themes.js";
import type { JevRequest, JevResponse } from "../jev/types.js";

export type Archetype =
  | "executive_overview"
  | "sales_performance"
  | "customer_acquisition"
  | "product_merchandising"
  | "fulfillment_operations"
  | "web_engagement"
  | "inventory_health";

export type DashboardDensity = "few" | "balanced" | "dense";
export type Audience = "executive" | "analyst" | "operator";

export interface ScopeDecisions {
  archetype: Archetype;
  timeWindow: TimeWindow;
  grain: Grain;
  comparePrior: boolean;
  density: DashboardDensity;
  audience: Audience;
  modePreference: "light" | "dark" | "no_preference";
  wantsGeo: boolean;
  wantsBreakdowns: boolean;
}

export interface FieldDecisions {
  metrics: string[];
  dimensions: string[]; // non-time, ordered by relevance
  primaryMetric: string;
  primaryDimension: string | null;
  relevance: Record<string, number>; // metric:<id> / dimension:<id> -> noul
}

export type TileRole = "kpi" | "trend" | "breakdown" | "geo" | "detail";

export interface PlannedTile {
  id: string;
  role: TileRole;
  metrics: string[];
  dimensions: string[]; // non-time
  hasTime: boolean;
  component: string;
  size: TileSize;
  importance: number; // 0..3 score
  confidence: number; // of the component choice
}

export interface PresentationDecisions extends PresentationOptions {
  layout: string;
  theme: string;
  connector: string;
}

export interface DecisionRecord {
  key: string;
  type: "choice" | "score" | "noul";
  value: string | number | boolean;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface StageTrace {
  stage: string;
  client: string;
  request: Omit<JevRequest, "model">;
  response: JevResponse;
  decisions: DecisionRecord[];
  ms: number;
}

export interface Plan {
  request: string;
  scope: ScopeDecisions;
  fields: FieldDecisions;
  tiles: PlannedTile[];
  presentation: PresentationDecisions;
  trace: StageTrace[];
}
