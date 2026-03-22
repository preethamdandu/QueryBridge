import { afterEach, describe, expect, it } from "vitest";
import { createDefaultCacheStore, createGatewayContext, createGatewayServer } from "../../server/src/app";
import { MCPClientPool, type MCPClient } from "../../server/src/mcp/client-pool";

function buildPool(overrides: Partial<Record<string, MCPClient>> = {}) {
  const pool = new MCPClientPool();

  pool.register(
    "query-service",
    overrides["query-service"] ?? {
      callTool: async () => ({ ok: true, service: "query-service" })
    }
  );
  pool.register(
    "auth-service",
    overrides["auth-service"] ?? {
      callTool: async (_toolName, args) => ({
        id: String(args.userId ?? "anonymous"),
        email: "integration.user@querybridge.local"
      })
    }
  );
  pool.register(
    "analytics-service",
    overrides["analytics-service"] ?? {
      callTool: async (_toolName, args) => ({
        range: String(args.range ?? "24h"),
        totalQueries: 42,
        errorRate: 0.002,
        p95Ms: 320
      })
    }
  );
  pool.register(
    "llm-router-service",
    overrides["llm-router-service"] ?? {
      callTool: async (_toolName, args) => ({
        text: `ok:${String(args.prompt ?? "")}`,
        provider: "openai",
        model: "gpt-4"
      })
    }
  );

  return pool;
}

const mockUser = { id: "dev-user", email: "integration.user@querybridge.local", createdAt: new Date(), updatedAt: new Date(), password: "x" };

const mockPrisma = {
  user: {
    findUnique: async () => mockUser,
    findMany: async () => [mockUser]
  },
  queryLog: { create: async () => ({}) },
  preference: { findUnique: async () => null, create: async (args: any) => ({ id: "pref-1", ...args.data }) },
  session: { findMany: async () => [] },
  $disconnect: async () => {}
} as any;

const mockLoaders = {
  userLoader: { load: async () => mockUser, loadMany: async () => [mockUser] },
  sessionLoader: { load: async () => [], loadMany: async () => [] }
} as any;

function ctx(overrides: Partial<Record<string, MCPClient>> = {}) {
  return createGatewayContext({
    userId: "dev-user",
    mcpPool: buildPool(overrides),
    cacheStore: createDefaultCacheStore(),
    prisma: mockPrisma,
    loaders: mockLoaders
  });
}

describe("MCP integration behavior", () => {
  afterEach(() => {
    process.env.MCP_TRANSPORT_MODE = "stub";
  });

  it("retries transient MCP failures and succeeds", async () => {
    const server = createGatewayServer();
    await server.start();

    let attempts = 0;
    const response = await server.executeOperation(
      {
        query: `query Test($prompt: String!) { llmQuery(input: { prompt: $prompt }) { text provider model } }`,
        variables: { prompt: "hello" }
      },
      {
        contextValue: ctx({
          "llm-router-service": {
            callTool: async () => {
              attempts += 1;
              if (attempts < 3) {
                throw new Error("temporary timeout");
              }
              return { text: "retry-success", provider: "openai", model: "gpt-4" };
            }
          }
        })
      }
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind !== "single") throw new Error("unexpected");

    expect(response.body.singleResult.errors).toBeUndefined();
    expect(response.body.singleResult.data).toEqual({
      llmQuery: { text: "retry-success", provider: "openai", model: "gpt-4" }
    });
    expect(attempts).toBe(3);
    await server.stop();
  });

  it("returns partial GraphQL data when one MCP resolver fails", async () => {
    const server = createGatewayServer();
    await server.start();

    const response = await server.executeOperation(
      {
        query: `query { viewer { id email } llmQuery(input: { prompt: "hello" }) { text provider model } }`
      },
      {
        contextValue: ctx({
          "llm-router-service": {
            callTool: async () => { throw new Error("llm-router down"); }
          }
        })
      }
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind !== "single") throw new Error("unexpected");

    expect(response.body.singleResult.data?.viewer).toEqual({
      id: "dev-user",
      email: "integration.user@querybridge.local"
    });
    expect(response.body.singleResult.data?.llmQuery).toBeNull();
    expect(response.body.singleResult.errors?.length).toBe(1);
    await server.stop();
  });

  it("returns analytics summary via analytics-service MCP tool", async () => {
    const server = createGatewayServer();
    await server.start();

    const response = await server.executeOperation(
      {
        query: `query($range:String!){ analyticsSummary(range:$range){ range totalQueries errorRate p95Ms } }`,
        variables: { range: "7d" }
      },
      { contextValue: ctx() }
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind !== "single") throw new Error("unexpected");

    expect(response.body.singleResult.errors).toBeUndefined();
    expect(response.body.singleResult.data).toEqual({
      analyticsSummary: { range: "7d", totalQueries: 42, errorRate: 0.002, p95Ms: 320 }
    });
    await server.stop();
  });

  it("returns partial GraphQL data when analytics resolver fails", async () => {
    const server = createGatewayServer();
    await server.start();

    const response = await server.executeOperation(
      {
        query: `query($range:String!,$prompt:String!){ viewer { id email } llmQuery(input:{ prompt:$prompt }) { text provider model } analyticsSummary(range:$range){ range totalQueries errorRate p95Ms } }`,
        variables: { range: "7d", prompt: "partial check" }
      },
      {
        contextValue: ctx({
          "analytics-service": {
            callTool: async () => { throw new Error("analytics-service down"); }
          }
        })
      }
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind !== "single") throw new Error("unexpected");

    expect(response.body.singleResult.data?.viewer).toEqual({
      id: "dev-user",
      email: "integration.user@querybridge.local"
    });
    expect(response.body.singleResult.data?.analyticsSummary).toBeNull();
    expect(response.body.singleResult.errors?.length).toBe(1);
    await server.stop();
  });
});
