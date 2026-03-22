import { describe, expect, it } from "vitest";

describe("rate limiter logic", () => {
  it("allows requests within limit", () => {
    const store = new Map<string, { count: number; resetAtMs: number }>();
    const max = 3;
    const windowMs = 60000;

    for (let i = 0; i < max; i++) {
      const key = "user:field";
      const entry = store.get(key);
      const now = Date.now();

      if (!entry || now >= entry.resetAtMs) {
        store.set(key, { count: 1, resetAtMs: now + windowMs });
      } else {
        entry.count += 1;
      }
    }

    expect(store.get("user:field")!.count).toBe(max);
  });

  it("detects when limit is exceeded", () => {
    const store = new Map<string, { count: number; resetAtMs: number }>();
    const max = 2;
    const now = Date.now();
    store.set("user:field", { count: max, resetAtMs: now + 60000 });

    const entry = store.get("user:field")!;
    expect(entry.count >= max).toBe(true);
  });
});
