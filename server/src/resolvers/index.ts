import type { GatewayContext } from "../context";
import { invokeToolForResolver } from "../mcp/invoke-tool";
import { authResolvers } from "./auth";
import { DateTimeScalar, JSONScalar, UUIDScalar } from "../schema/scalars";

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,
  UUID: UUIDScalar,

  Query: {
    health: async (_: unknown, __: unknown, context: GatewayContext) => {
      return invokeToolForResolver(context, "Query.health", {});
    },

    viewer: async (_: unknown, __: unknown, context: GatewayContext) => {
      const userId = context.userId;
      if (!userId) {
        return null;
      }

      const user = await context.loaders.userLoader.load(userId);
      if (!user) {
        return null;
      }

      return { id: user.id, email: user.email, createdAt: user.createdAt };
    },

    llmQuery: async (
      _: unknown,
      args: { input: { prompt: string } },
      context: GatewayContext
    ) => {
      const startMs = Date.now();
      let result: Record<string, unknown>;
      let status = "success";

      try {
        result = await invokeToolForResolver(
          context,
          "Query.llmQuery",
          { prompt: args.input.prompt },
          { cacheable: false }
        );
      } catch (error) {
        status = "error";
        if (context.userId) {
          await context.prisma.queryLog.create({
            data: {
              userId: context.userId,
              prompt: args.input.prompt,
              status,
              latencyMs: Date.now() - startMs
            }
          }).catch(() => {});
        }
        throw error;
      }

      if (context.userId) {
        await context.prisma.queryLog.create({
          data: {
            userId: context.userId,
            prompt: args.input.prompt,
            response: String(result.text ?? ""),
            provider: String(result.provider ?? ""),
            model: String(result.model ?? ""),
            latencyMs: Date.now() - startMs,
            status
          }
        }).catch(() => {});
      }

      return result;
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
    register: authResolvers.register,
    login: authResolvers.login,
    refreshToken: authResolvers.refreshToken,
    revokeSession: authResolvers.revokeSession,

    upsertPreference: async (
      _: unknown,
      args: { input: { key: string; value: string; idempotencyKey: string } },
      context: GatewayContext
    ) => {
      const userId = context.userId ?? "";
      const existing = await context.prisma.preference.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey: args.input.idempotencyKey
          }
        }
      });

      if (existing) {
        return { id: existing.id, key: existing.key, value: existing.value };
      }

      const pref = await context.prisma.preference.create({
        data: {
          userId,
          key: args.input.key,
          value: args.input.value,
          idempotencyKey: args.input.idempotencyKey
        }
      });

      return { id: pref.id, key: pref.key, value: pref.value };
    }
  }
};
