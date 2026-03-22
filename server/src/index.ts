import { startStandaloneServer } from "@apollo/server/standalone";
import { createDefaultCacheStore, createGatewayContext, createGatewayServer } from "./app";
import { getAuthContext } from "./middleware/auth";
import { buildMCPClientPool } from "./mcp/build-client-pool";

async function bootstrap(): Promise<void> {
  const mcpPool = buildMCPClientPool();
  const cacheStore = createDefaultCacheStore();
  const server = createGatewayServer();

  const { url } = await startStandaloneServer(server, {
    context: async ({ req }) => {
      const auth = getAuthContext(req.headers.authorization);
      return createGatewayContext({ userId: auth.userId, mcpPool, cacheStore });
    },
    listen: { port: Number(process.env.PORT ?? 4000) }
  });

  console.log(`Gateway ready at ${url}`);
}

bootstrap().catch((error) => {
  console.error("Gateway startup failed", error);
  process.exit(1);
});
