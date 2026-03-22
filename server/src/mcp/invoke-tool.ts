import type { GatewayContext } from "../context";
import { withCache } from "./cache-interceptor";
import { withRetries } from "./retry-handler";
import { getToolForResolver, type ResolverPath } from "./tool-registry";

function makeCacheKey(path: ResolverPath, args: Record<string, unknown>): string {
  return `${path}:${JSON.stringify(args)}`;
}

export async function invokeToolForResolver(
  context: GatewayContext,
  path: ResolverPath,
  args: Record<string, unknown>,
  options?: { cacheable?: boolean }
): Promise<Record<string, unknown>> {
  const { server, toolName } = getToolForResolver(path);
  const cacheable = options?.cacheable ?? true;
  const client = context.mcpPool.get(server);

  if (!cacheable) {
    return withRetries(() => client.callTool(toolName, args));
  }

  const { value } = await withCache(
    context.cacheStore,
    makeCacheKey(path, args),
    () => withRetries(() => client.callTool(toolName, args))
  );

  return value;
}
