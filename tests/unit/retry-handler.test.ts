import { describe, expect, it } from "vitest";
import { withRetries } from "../../server/src/mcp/retry-handler";

describe("withRetries", () => {
  it("returns immediately on first success", async () => {
    let calls = 0;
    const result = await withRetries(async () => {
      calls += 1;
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on failure and returns eventual success", async () => {
    let calls = 0;
    const result = await withRetries(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error("transient");
      }
      return "recovered";
    });

    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("throws after exceeding max retries", async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw new Error("permanent");
      }, 2)
    ).rejects.toThrow("permanent");

    expect(calls).toBe(3);
  });

  it("respects custom maxRetries", async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw new Error("fail");
      }, 0)
    ).rejects.toThrow("fail");

    expect(calls).toBe(1);
  });
});
