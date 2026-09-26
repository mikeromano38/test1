import type { JevAnswer, JevClient, JevQuestion, JevRequest, JevResponse, JevState } from "./types.js";

/**
 * Deterministic stand-in for Jev so the pipeline, composer and tests run with
 * no API key. It is intentionally dumb: lexical overlap between the state and
 * each option / instruction, turned into a probability distribution. It exists
 * to exercise the *shape* of the decision graph, not to be a good judge.
 *
 * Swap in HttpJevClient (or a FixtureJevClient replaying recorded answers) for
 * real decisions.
 */
export class MockJevClient implements JevClient {
  readonly name = "mock";

  async systemOne(request: Omit<JevRequest, "model"> & { model?: string }): Promise<JevResponse> {
    const stateTokens = tokenize(flattenState(request.state));
    const answers: Record<string, JevAnswer> = {};
    for (const [key, q] of Object.entries(request.questions)) {
      answers[key] = answer(q, stateTokens);
    }
    return { model: "mock-jev-0", answers, usage: { input_tokens: stateTokens.length, output_tokens: 0 } };
  }
}

function answer(q: JevQuestion, state: string[]): JevAnswer {
  switch (q.type) {
    case "choice": {
      const keys = Object.keys(q.criteria);
      const raw = keys.map((k) => 0.15 + overlap(state, tokenize(`${k} ${q.criteria[k]}`)));
      const probabilities = softmax(raw, keys, 6);
      const choice = keys.reduce((best, k) => (probabilities[k] > probabilities[best] ? k : best), keys[0]);
      return { type: "choice", choice, probabilities, confidence: confidenceOf(probabilities) };
    }
    case "score": {
      const levels = q.criteria.map((c, i) => `${i}`);
      const raw = q.criteria.map((c) => 0.15 + overlap(state, tokenize(c)));
      const probabilities = softmax(raw, levels, 6);
      const score = levels.reduce((acc, l, i) => acc + probabilities[l] * i, 0);
      const legend = Object.fromEntries(q.criteria.map((c, i) => [`${i}`, c]));
      return { type: "score", score, legend, probabilities, confidence: confidenceOf(probabilities) };
    }
    case "noul": {
      const o = overlap(state, tokenize(q.instructions));
      // squash 0..1 overlap into a belief that stays away from the extremes
      const noul = clamp(0.2 + o * 1.4, 0.05, 0.95);
      return { type: "noul", noul: round(noul) };
    }
  }
}

/* ---------------------------- helpers ---------------------------- */

const STOP = new Set(
  "a an the of to for and or in on by with is are be this that it as at from over per vs into show me my our".split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

function stem(t: string): string {
  return t.replace(/(ings?|ies|es|s|ed)$/u, (m) => (t.length - m.length >= 3 ? "" : m));
}

function overlap(state: string[], q: string[]): number {
  const distinct = new Set(q);
  if (distinct.size === 0) return 0;
  const s = new Set(state);
  let hits = 0;
  for (const t of distinct) if (s.has(t)) hits += 1;
  return hits / distinct.size;
}

export function flattenState(state: JevState): string {
  if (typeof state === "string") return state;
  if (Array.isArray(state)) return state.join("\n");
  return JSON.stringify(state).replace(/[{}\[\]":,]/g, " ");
}

function softmax(raw: number[], keys: string[], temperature: number): Record<string, number> {
  const exps = raw.map((r) => Math.exp(r * temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Object.fromEntries(keys.map((k, i) => [k, round(exps[i] / sum)]));
}

function confidenceOf(p: Record<string, number>): number {
  const sorted = Object.values(p).sort((a, b) => b - a);
  return round(sorted.length > 1 ? sorted[0] - sorted[1] : 1);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number) => Math.round(x * 1000) / 1000;
