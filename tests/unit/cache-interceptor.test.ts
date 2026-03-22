import { describe, expect, it } from "vitest";
import { withCache } from "../../server/src/mcp/cache-interceptor";

function createMockCache() {
  const store = new Map<string, { value: Record<string, unknown>; ttl: number }>();

  return {
    get: async (key: string) => store.get(key)?.value ?? null,
    set: async (key: string, value: Record<string, unknown>, ttl: number) => {
      store.set(key, { value, ttl });
    },
    store
  };
}

describe("withCache", () => {
  it("calls operation on cache miss and stores result", async () => {
    const cache = createMockCache();
    let called = false;

    const { value, cacheHit } = await withCache(cache, "key1", async () => {
      called = true;
      return { data: "fresh" };
    });

    expect(called).toBe(true);
    expect(cacheHit).toBe(false);
    expect(value).toEqual({ data: "fresh" });
    expect(cache.store.has("key1")).toBe(true);
  });

  it("returns cached value on cache hit without calling operation", async () => {
    const cache = createMockCache();
    await cache.set("key2", { data: "cached" }, 30);

    let called = false;
    const { value, cacheHit } = await withCache(cache, "key2", async () => {
      called = true;
      return { data: "should-not-appear" };
    });

    expect(called).toBe(false);
    expect(cacheHit).toBe(true);
    expect(value).toEqual({ data: "cached" });
  });

  it("applies TTL jitter between 30 and 40 seconds", async () => {
    const cache = createMockCache();
    await withCache(cache, "key3", async () => ({ data: "test" }));

    const stored = cache.store.get("key3");
    expect(stored).toBeDefined();
    expect(stored!.ttl).toBeGreaterThanOrEqual(30);
    expect(stored!.ttl).toBeLessThan(40);
  });
});
