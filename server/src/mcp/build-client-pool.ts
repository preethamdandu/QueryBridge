import { MCPClientPool, type MCPServerName } from "./client-pool";
import { HttpMCPClient } from "./http-client";

type ServiceUrlMap = Record<MCPServerName, string>;

function getDefaultServiceUrls(): ServiceUrlMap {
  return {
    "query-service": process.env.QUERY_SERVICE_URL ?? "http://localhost:4001",
    "auth-service": process.env.AUTH_SERVICE_URL ?? "http://localhost:4002",
    "llm-router-service": process.env.LLM_ROUTER_SERVICE_URL ?? "http://localhost:4003",
    "analytics-service": process.env.ANALYTICS_SERVICE_URL ?? "http://localhost:4004"
  };
}

function buildDevStubPool(): MCPClientPool {
  const pool = new MCPClientPool();
  pool.register("query-service", {
    callTool: async () => ({ ok: true, service: "query-service" })
  });
  pool.register("auth-service", {
    callTool: async (_toolName, args) => ({
      id: String(args.userId ?? "anonymous"),
      email: "dev.user@querybridge.local"
    })
  });
  pool.register("llm-router-service", {
    callTool: async (_toolName, args) => ({
      text: `router-placeholder: ${String(args.prompt ?? "")}`,
      provider: process.env.LLM_PROVIDER ?? "openai",
      model: process.env.LLM_PROVIDER === "gemini" ? "gemini-1.5-pro" : "gpt-4"
    })
  });
  pool.register("analytics-service", {
    callTool: async () => ({ ok: true })
  });

  return pool;
}

export function buildMCPClientPool(): MCPClientPool {
  if (process.env.MCP_TRANSPORT_MODE === "stub") {
    return buildDevStubPool();
  }

  const pool = new MCPClientPool();
  const serviceUrls = getDefaultServiceUrls();

  for (const serverName of Object.keys(serviceUrls) as MCPServerName[]) {
    pool.register(serverName, new HttpMCPClient(serviceUrls[serverName]));
  }

  return pool;
}
