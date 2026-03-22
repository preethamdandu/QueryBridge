import { startStandaloneServer } from "@apollo/server/standalone";
import { createGatewayContext, createGatewayServer } from "./app";
import { getAuthContext } from "./middleware/auth";
import { buildMCPClientPool } from "./mcp/build-client-pool";
import { getPrisma, disconnectPrisma } from "./db";
import { RedisCacheStore, connectRedis, disconnectRedis } from "./cache/redis-client";
import { InMemoryCacheStore } from "./mcp/in-memory-cache";
import { createLoaders } from "./loaders";

async function bootstrap(): Promise<void> {
  const mcpPool = buildMCPClientPool();
  const prisma = getPrisma();

  let cacheStore: RedisCacheStore | InMemoryCacheStore;
  try {
    await connectRedis();
    cacheStore = new RedisCacheStore();
    console.log("Connected to Redis");
  } catch {
    console.warn("Redis unavailable, falling back to in-memory cache");
    cacheStore = new InMemoryCacheStore();
  }

  const server = createGatewayServer();

  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => {
      const auth = await getAuthContext(req.headers.authorization);
      const loaders = createLoaders(prisma);
      return createGatewayContext({ userId: auth.userId, mcpPool, cacheStore, prisma, loaders });
    },
    listen: { port: Number(process.env.PORT ?? 4000) }
  });

  console.log(`Gateway ready at ${url}`);

  const shutdown = async () => {
    console.log("Shutting down...");
    await server.stop();
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap().catch((error) => {
  console.error("Gateway startup failed", error);
  process.exit(1);
});
