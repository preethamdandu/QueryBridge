import { ApolloServer } from "@apollo/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { join } from "node:path";
import type { GatewayContext, CacheStore } from "./context";
import { createComplexityGuardPlugin } from "./middleware/complexity-guard";
import { InMemoryCacheStore } from "./mcp/in-memory-cache";
import type { MCPClientPool } from "./mcp/client-pool";
import type { PrismaClient } from "@prisma/client";
import type { Loaders } from "./loaders";
import { resolvers } from "./resolvers";
import { applyGatewayDirectives } from "./schema/directives";
import { loadTypeDefs } from "./schema/load-schema";

export function buildGatewaySchema() {
  const baseSchema = makeExecutableSchema({
    typeDefs: loadTypeDefs(join(__dirname, "schema")),
    resolvers
  });
  return applyGatewayDirectives(baseSchema);
}

export function createGatewayServer() {
  return new ApolloServer<GatewayContext>({
    schema: buildGatewaySchema(),
    plugins: [createComplexityGuardPlugin()]
  });
}

export function createDefaultCacheStore(): InMemoryCacheStore {
  return new InMemoryCacheStore();
}

export type CreateContextArgs = {
  userId: string | null;
  mcpPool: MCPClientPool;
  cacheStore: CacheStore;
  prisma: PrismaClient;
  loaders?: Loaders;
};

export function createGatewayContext(args: CreateContextArgs): GatewayContext {
  const loaders = args.loaders ?? {
    userLoader: { load: async () => null, loadMany: async () => [] } as any,
    sessionLoader: { load: async () => [], loadMany: async () => [] } as any
  };

  return {
    userId: args.userId,
    mcpPool: args.mcpPool,
    cacheStore: args.cacheStore,
    prisma: args.prisma,
    loaders
  };
}
