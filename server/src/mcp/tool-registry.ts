import type { MCPServerName } from "./client-pool";

export type ResolverPath =
  | "Query.health"
  | "Query.llmQuery"
  | "Query.viewer"
  | "Query.analyticsSummary";

type ToolMapping = {
  server: MCPServerName;
  toolName: string;
};

const registry: Record<ResolverPath, ToolMapping> = {
  "Query.health": {
    server: "query-service",
    toolName: "health"
  },
  "Query.llmQuery": {
    server: "llm-router-service",
    toolName: "route-llm-query"
  },
  "Query.viewer": {
    server: "auth-service",
    toolName: "get-viewer"
  },
  "Query.analyticsSummary": {
    server: "analytics-service",
    toolName: "summary"
  }
};

export function getToolForResolver(path: ResolverPath): ToolMapping {
  return registry[path];
}
