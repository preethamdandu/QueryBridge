import { ApolloServer } from "@apollo/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { join } from "node:path";
import type { GatewayContext } from "./context";
import { createComplexityGuardPlugin } from "./middleware/complexity-guard";
import { InMemoryCacheStore } from "./mcp/in-memory-cache";
import type { MCPClientPool } from "./mcp/client-pool";
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

export function createDefaultCacheStore() {
  return new InMemoryCacheStore();
}

export type CreateContextArgs = {
  userId: string | null;
  mcpPool: MCPClientPool;
  cacheStore: InMemoryCacheStore;
};

export function createGatewayContext(args: CreateContextArgs): GatewayContext {
  return {
    userId: args.userId,
    mcpPool: args.mcpPool,
    cacheStore: args.cacheStore
  };
}
