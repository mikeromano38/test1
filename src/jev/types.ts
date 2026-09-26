/**
 * Types mirroring the TypeSafe AI "System One" API used by Jev.
 *
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer $TYPESAFE_API_KEY
 *
 * Jev never generates text. It answers three kinds of typed questions about a
 * piece of `state`:
 *   - choice: pick one option from a described set (<= 255 options)
 *   - score : position on an ordered rubric (2..10 levels), returned as a
 *             probability-weighted number
 *   - noul  : a yes/no belief returned as a probability in [0, 1]
 *
 * Every question is evaluated in parallel inside one call, so the cheapest
 * pattern is "speculative fan-out": ask everything at once, decide in code.
 */

export type JevState = string | string[] | Record<string, unknown>;

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  /** option key -> description of when that option applies */
  criteria: Record<string, string>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  /** ordered level descriptions; index 0 is the first level */
  criteria: string[];
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export type JevQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface JevRequest {
  model: string;
  state: JevState;
  questions: Record<string, JevQuestion>;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  legend?: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export type JevAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
}

/** Anything that can answer a batch of Jev questions. */
export interface JevClient {
  readonly name: string;
  systemOne(request: Omit<JevRequest, "model"> & { model?: string }): Promise<JevResponse>;
}

/* ---------- small constructors, mirroring the official SDK helpers ---------- */

export const choice = (instructions: string, criteria: Record<string, string>): ChoiceQuestion => ({
  type: "choice",
  instructions,
  criteria,
});

export const score = (instructions: string, criteria: string[]): ScoreQuestion => ({
  type: "score",
  instructions,
  criteria,
});

export const noul = (instructions: string, criteria?: { true: string; false: string }): NoulQuestion => ({
  type: "noul",
  instructions,
  ...(criteria ? { criteria } : {}),
});

/* ---------- typed accessors so stages never guess the answer shape ---------- */

export function getChoice(res: JevResponse, key: string): ChoiceAnswer {
  const a = res.answers[key];
  if (!a || a.type !== "choice") throw new Error(`Expected choice answer for "${key}"`);
  return a;
}

export function getScore(res: JevResponse, key: string): ScoreAnswer {
  const a = res.answers[key];
  if (!a || a.type !== "score") throw new Error(`Expected score answer for "${key}"`);
  return a;
}

export function getNoul(res: JevResponse, key: string): number {
  const a = res.answers[key];
  if (!a || a.type !== "noul") throw new Error(`Expected noul answer for "${key}"`);
  return a.noul;
}
