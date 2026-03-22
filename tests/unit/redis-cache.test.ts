import { describe, expect, it } from "vitest";
import { InMemoryCacheStore } from "../../server/src/mcp/in-memory-cache";

describe("InMemoryCacheStore", () => {
  it("returns null for missing key", async () => {
    const store = new InMemoryCacheStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    const store = new InMemoryCacheStore();
    await store.set("key1", { x: 1 }, 60);
    expect(await store.get("key1")).toEqual({ x: 1 });
  });

  it("returns null for expired entries", async () => {
    const store = new InMemoryCacheStore();
    await store.set("key2", { x: 2 }, 0);
    await new Promise((r) => setTimeout(r, 10));
    expect(await store.get("key2")).toBeNull();
  });
});
