import type { PrismaClient } from "@prisma/client";
import type { MCPClientPool } from "./mcp/client-pool";
import type { RedisCacheStore } from "./cache/redis-client";
import type { InMemoryCacheStore } from "./mcp/in-memory-cache";
import type { Loaders } from "./loaders";

export type CacheStore = RedisCacheStore | InMemoryCacheStore;

export type GatewayContext = {
  userId: string | null;
  mcpPool: MCPClientPool;
  cacheStore: CacheStore;
  prisma: PrismaClient;
  loaders: Loaders;
};
