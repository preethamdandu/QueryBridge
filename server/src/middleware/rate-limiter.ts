import { mapSchema, MapperKind } from "@graphql-tools/utils";
import { GraphQLError, Kind, defaultFieldResolver, type GraphQLSchema } from "graphql";
import type { GatewayContext } from "../context";

type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

const store = new Map<string, RateLimitEntry>();

function checkRateLimit(
  userId: string,
  fieldName: string,
  max: number,
  windowSeconds: number
): void {
  const key = `${userId}:${fieldName}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAtMs) {
    store.set(key, { count: 1, resetAtMs: now + windowSeconds * 1000 });
    return;
  }

  if (entry.count >= max) {
    const retryAfterMs = entry.resetAtMs - now;
    throw new GraphQLError(
      `Rate limit exceeded for ${fieldName}. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
      { extensions: { code: "RATE_LIMITED", retryAfterMs } }
    );
  }

  entry.count += 1;
}

function getRateLimitArgs(
  astDirectives: readonly any[] | undefined
): { max: number; windowSeconds: number } | null {
  if (!astDirectives) {
    return null;
  }

  const rlDirective = astDirectives.find(
    (d: any) => d.name.value === "rateLimit"
  );
  if (!rlDirective?.arguments) {
    return null;
  }

  let max = 0;
  let windowSeconds = 0;
  for (const arg of rlDirective.arguments) {
    if (arg.name.value === "max" && arg.value.kind === Kind.INT) {
      max = Number(arg.value.value);
    }
    if (arg.name.value === "windowSeconds" && arg.value.kind === Kind.INT) {
      windowSeconds = Number(arg.value.value);
    }
  }

  return max > 0 && windowSeconds > 0 ? { max, windowSeconds } : null;
}

export function applyRateLimitDirective(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const rateLimitArgs = getRateLimitArgs(fieldConfig.astNode?.directives as any);
      if (!rateLimitArgs) {
        return fieldConfig;
      }

      const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;
      fieldConfig.resolve = async (source, args, context, info) => {
        const ctx = context as GatewayContext;
        const userId = ctx.userId ?? "anonymous";
        checkRateLimit(userId, info.fieldName, rateLimitArgs.max, rateLimitArgs.windowSeconds);
        return originalResolve(source, args, context, info);
      };

      return fieldConfig;
    }
  });
}
