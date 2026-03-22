import type { MCPClientPool } from "./mcp/client-pool";
import type { InMemoryCacheStore } from "./mcp/in-memory-cache";

export type GatewayContext = {
  userId: string | null;
  mcpPool: MCPClientPool;
  cacheStore: InMemoryCacheStore;
};
