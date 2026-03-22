import type { GatewayContext } from "../context";
import { invokeToolForResolver } from "../mcp/invoke-tool";

const userPreferenceStore = new Map<string, { key: string; value: string }>();

export const resolvers = {
  Query: {
    health: async (_: unknown, __: unknown, context: GatewayContext) => {
      return invokeToolForResolver(context, "Query.health", {});
    },
    viewer: async (_: unknown, __: unknown, context: GatewayContext) => {
      return invokeToolForResolver(
        context,
        "Query.viewer",
        { userId: context.userId ?? "anonymous" },
        { cacheable: false }
      );
    },
    llmQuery: async (
      _: unknown,
      args: { input: { prompt: string } },
      context: GatewayContext
    ) => {
      return invokeToolForResolver(
        context,
        "Query.llmQuery",
        { prompt: args.input.prompt },
        { cacheable: false }
      );
    },
    analyticsSummary: async (
      _: unknown,
      args: { range: string },
      context: GatewayContext
    ) => {
      return invokeToolForResolver(context, "Query.analyticsSummary", {
        range: args.range
      });
    }
  },
  Mutation: {
    upsertPreference: (
      _: unknown,
      args: { input: { key: string; value: string; idempotencyKey: string } },
      context: GatewayContext
    ) => {
      const key = `${context.userId ?? "anonymous"}:${args.input.idempotencyKey}`;
      if (userPreferenceStore.has(key)) {
        return userPreferenceStore.get(key);
      }

      const preference = { key: args.input.key, value: args.input.value };
      userPreferenceStore.set(key, preference);
      return preference;
    }
  }
};
