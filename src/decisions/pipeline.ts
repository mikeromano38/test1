import type { JevClient } from "../jev/types.js";
import type { Plan } from "./plan.js";
import { fieldsStage, presentationStage, scopeStage, tilesStage, type StageContext } from "./stages.js";

export interface PipelineOptions {
  jev: JevClient;
  environment?: StageContext["environment"];
  /** override any stage's decisions after Jev ran (used by tests and the CLI's --set flags) */
  overrides?: Partial<Pick<Plan, "scope" | "presentation">>;
}

/**
 * Four sequential Jev calls. Each later stage's questions depend on the
 * earlier answers (which metrics exist decides which tiles are candidates),
 * so they cannot be merged; within a stage everything is one fan-out call.
 */
export async function planDashboard(request: string, opts: PipelineOptions): Promise<Plan> {
  const ctx: StageContext = {
    jev: opts.jev,
    request,
    environment: opts.environment ?? { credentialsAvailable: false, offline: true },
  };
  const s = await scopeStage(ctx);
  const scope = { ...s.scope, ...(opts.overrides?.scope ?? {}) };
  const f = await fieldsStage(ctx, scope);
  const t = await tilesStage(ctx, scope, f.fields);
  const p = await presentationStage(ctx, scope, t.tiles);
  const presentation = { ...p.presentation, ...(opts.overrides?.presentation ?? {}) };
  return { request, scope, fields: f.fields, tiles: t.tiles, presentation, trace: [s.trace, f.trace, t.trace, p.trace] };
}
