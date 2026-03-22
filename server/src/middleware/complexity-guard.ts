import type { ApolloServerPlugin } from "@apollo/server";
import {
  GraphQLError,
  Kind,
  type DocumentNode,
  type FieldDefinitionNode,
  type FragmentDefinitionNode,
  type GraphQLObjectType,
  type GraphQLSchema,
  type SelectionSetNode
} from "graphql";

const MAX_QUERY_DEPTH = 7;
const MAX_QUERY_COST = 1000;

function unwrapNamedType(graphqlType: unknown): unknown {
  let current = graphqlType as { ofType?: unknown } | undefined;
  while (current && "ofType" in current && current.ofType) {
    current = current.ofType as { ofType?: unknown };
  }
  return current;
}

function isObjectTypeLike(graphqlType: unknown): graphqlType is GraphQLObjectType {
  return Boolean(
    graphqlType &&
      typeof graphqlType === "object" &&
      "getFields" in (graphqlType as Record<string, unknown>) &&
      typeof (graphqlType as { getFields?: unknown }).getFields === "function"
  );
}

function getFieldComplexity(astNode?: FieldDefinitionNode | null): number {
  if (!astNode?.directives) {
    return 1;
  }

  const complexityDirective = astNode.directives.find(
    (directive) => directive.name.value === "complexity"
  );
  if (!complexityDirective?.arguments) {
    return 1;
  }

  const valueArg = complexityDirective.arguments.find((arg) => arg.name.value === "value");
  if (!valueArg || valueArg.value.kind !== Kind.INT) {
    return 1;
  }

  const parsed = Number(valueArg.value.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function analyzeOperationComplexity(
  schema: GraphQLSchema,
  document: DocumentNode,
  operationName?: string
): { depth: number; cost: number } {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }

  const operationDefinition = document.definitions.find((definition) => {
    if (definition.kind !== Kind.OPERATION_DEFINITION) {
      return false;
    }
    if (!operationName) {
      return true;
    }
    return definition.name?.value === operationName;
  });

  if (!operationDefinition || operationDefinition.kind !== Kind.OPERATION_DEFINITION) {
    return { depth: 0, cost: 0 };
  }

  const rootType =
    operationDefinition.operation === "mutation"
      ? schema.getMutationType()
      : schema.getQueryType();
  if (!rootType) {
    return { depth: 0, cost: 0 };
  }

  let maxDepth = 0;
  let totalCost = 0;

  const walk = (
    selectionSet: SelectionSetNode,
    parentType: GraphQLObjectType,
    depth: number
  ): void => {
    if (depth > maxDepth) {
      maxDepth = depth;
    }

    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        if (selection.name.value.startsWith("__")) {
          continue;
        }

        const field = parentType.getFields()[selection.name.value];
        totalCost += getFieldComplexity(field?.astNode);

        if (!selection.selectionSet || !field) {
          continue;
        }

        const childType = unwrapNamedType(field.type);
        if (isObjectTypeLike(childType)) {
          walk(selection.selectionSet, childType, depth + 1);
        }
        continue;
      }

      if (selection.kind === Kind.INLINE_FRAGMENT) {
        const typeName = selection.typeCondition?.name.value;
        const fragmentType = typeName ? schema.getType(typeName) : parentType;
        if (fragmentType && isObjectTypeLike(fragmentType)) {
          walk(selection.selectionSet, fragmentType, depth + 1);
        }
        continue;
      }

      const fragment = fragments.get(selection.name.value);
      if (!fragment) {
        continue;
      }
      const fragmentType = schema.getType(fragment.typeCondition.name.value);
      if (fragmentType && isObjectTypeLike(fragmentType)) {
        walk(fragment.selectionSet, fragmentType, depth + 1);
      }
    }
  };

  walk(operationDefinition.selectionSet, rootType, 1);
  return { depth: maxDepth, cost: totalCost };
}

export function createComplexityGuardPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation(requestContext) {
          const { depth, cost } = analyzeOperationComplexity(
            requestContext.schema,
            requestContext.document,
            requestContext.operationName ?? undefined
          );

          if (depth > MAX_QUERY_DEPTH) {
            throw new GraphQLError(
              `Query depth ${depth} exceeds max allowed ${MAX_QUERY_DEPTH}`
            );
          }

          if (cost > MAX_QUERY_COST) {
            throw new GraphQLError(`Query cost ${cost} exceeds max allowed ${MAX_QUERY_COST}`);
          }
        }
      };
    }
  };
}
