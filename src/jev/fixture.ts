import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { JevClient, JevRequest, JevResponse } from "./types.js";

/**
 * Record/replay wrapper. Every request is hashed (model + state + questions);
 * if a fixture exists it is replayed, otherwise the inner client is called and
 * the response is saved. Lets tests run real Jev answers offline and makes
 * threshold tuning reproducible (pin the model version when recording).
 */
export class FixtureJevClient implements JevClient {
  readonly name: string;
  constructor(
    private readonly inner: JevClient | null,
    private readonly dir: string,
    private readonly mode: "replay" | "record" = "record",
  ) {
    this.name = `fixture(${inner?.name ?? "none"})`;
    mkdirSync(dir, { recursive: true });
  }

  async systemOne(request: Omit<JevRequest, "model"> & { model?: string }): Promise<JevResponse> {
    const key = createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 24);
    const file = join(this.dir, `${key}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as JevResponse;
    if (this.mode === "replay" || !this.inner) {
      throw new Error(`No recorded Jev fixture for request ${key} (run with a TYPESAFE_API_KEY to record)`);
    }
    const res = await this.inner.systemOne(request);
    writeFileSync(file, JSON.stringify({ request, ...res }, null, 2));
    return res;
  }
}
