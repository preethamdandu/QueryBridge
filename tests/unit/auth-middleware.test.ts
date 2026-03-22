import { describe, expect, it, beforeEach } from "vitest";
import { getAuthContext } from "../../server/src/middleware/auth";

describe("getAuthContext", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.JWT_PUBLIC_KEY = "replace-with-public-key";
  });

  it("returns null userId when no header is provided", async () => {
    const ctx = await getAuthContext(undefined);
    expect(ctx.userId).toBeNull();
  });

  it("returns null userId for empty bearer token", async () => {
    const ctx = await getAuthContext("Bearer ");
    expect(ctx.userId).toBeNull();
  });

  it("returns dev-user in development when JWT_PUBLIC_KEY is not configured", async () => {
    const ctx = await getAuthContext("Bearer some-dev-token");
    expect(ctx.userId).toBe("dev-user");
  });

  it("returns null userId in production with unconfigured key", async () => {
    process.env.NODE_ENV = "production";
    const ctx = await getAuthContext("Bearer some-token");
    expect(ctx.userId).toBeNull();
  });

  it("returns null userId for malformed authorization header", async () => {
    const ctx = await getAuthContext("Basic user:pass");
    expect(ctx.userId).toBeNull();
  });
});
