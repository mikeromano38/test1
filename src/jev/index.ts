import { FixtureJevClient } from "./fixture.js";
import { HttpJevClient } from "./http.js";
import { MockJevClient } from "./mock.js";
import type { JevClient } from "./types.js";

export * from "./types.js";
export { HttpJevClient, MockJevClient, FixtureJevClient };

export type JevMode = "auto" | "mock" | "live" | "record" | "replay";

/**
 * auto   -> live if TYPESAFE_API_KEY is set, else mock
 * live   -> HTTP client, no fixtures
 * record -> HTTP client, responses saved under fixtures/jev
 * replay -> fixtures only (fails on a miss)
 * mock   -> deterministic lexical stand-in
 */
export function createJevClient(mode: JevMode = "auto", fixtureDir = "fixtures/jev"): JevClient {
  const hasKey = Boolean(process.env.TYPESAFE_API_KEY);
  if (mode === "auto") mode = hasKey ? "live" : "mock";
  switch (mode) {
    case "mock":
      return new MockJevClient();
    case "live":
      return new HttpJevClient();
    case "record":
      return new FixtureJevClient(new HttpJevClient(), fixtureDir, "record");
    case "replay":
      return new FixtureJevClient(null, fixtureDir, "replay");
  }
}
