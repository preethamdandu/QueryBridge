import { mapSchema, MapperKind } from "@graphql-tools/utils";
import { GraphQLError, defaultFieldResolver } from "graphql";
import type { GraphQLSchema } from "graphql";
import type { GatewayContext } from "../context";
import { applyRateLimitDirective } from "../middleware/rate-limiter";

function hasDirective(
  directives: readonly { name: { value: string } }[] | undefined,
  directiveName: string
): boolean {
  if (!directives) {
    return false;
  }

  return directives.some((directive) => directive.name.value === directiveName);
}

function applyAuthDirective(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      if (!hasDirective(fieldConfig.astNode?.directives, "auth")) {
        return fieldConfig;
      }

      const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;
      fieldConfig.resolve = async (source, args, context, info) => {
        const gatewayContext = context as GatewayContext;
        if (!gatewayContext.userId) {
          throw new GraphQLError("Unauthorized", {
            extensions: { code: "UNAUTHENTICATED" }
          });
        }
        return originalResolve(source, args, context, info);
      };

      return fieldConfig;
    }
  });
}

export function applyGatewayDirectives(schema: GraphQLSchema): GraphQLSchema {
  let result = applyAuthDirective(schema);
  result = applyRateLimitDirective(result);
  return result;
}
