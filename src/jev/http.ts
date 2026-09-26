import type { JevClient, JevRequest, JevResponse } from "./types.js";

export interface HttpJevClientOptions {
  apiKey?: string;
  baseUrl?: string;
  /** Pin a version (e.g. "jev-1.13.0") when tuning thresholds; "jev-latest" moves. */
  model?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Minimal HTTP client for the TypeSafe System One endpoint. Uses global fetch
 * (Node >= 20) so the project has no runtime dependencies. The official SDK
 * (`npm i @typesafe-ai/sdk`) exposes the same request/response shapes; swap it
 * in behind the JevClient interface if you prefer.
 */
export class HttpJevClient implements JevClient {
  readonly name = "typesafe-http";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(opts: HttpJevClientOptions = {}) {
    const key = opts.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!key) throw new Error("TYPESAFE_API_KEY is not set (or pass apiKey)");
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? process.env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai/v1").replace(/\/$/, "");
    this.model = opts.model ?? process.env.JEV_MODEL ?? "jev-latest";
    this.maxRetries = opts.maxRetries ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async systemOne(request: Omit<JevRequest, "model"> & { model?: string }): Promise<JevResponse> {
    const body: JevRequest = { model: request.model ?? this.model, state: request.state, questions: request.questions };
    let attempt = 0;
    // 429 / 529 are documented as "retry with exponential backoff".
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/systemone`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.ok) return (await res.json()) as JevResponse;
        const text = await res.text();
        const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
        if (!retryable || attempt >= this.maxRetries) {
          throw new Error(`Jev request failed: HTTP ${res.status} ${text.slice(0, 500)}`);
        }
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
      } finally {
        clearTimeout(timer);
      }
      attempt += 1;
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
    }
  }
}
