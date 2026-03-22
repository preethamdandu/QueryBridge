# SKILLS.md — QueryBridge

> This file maps technical decisions to the files where they live. Use it to navigate the codebase when reviewing a specific area.

---

## MCP Integration
**Where:** `server/src/mcp/`

The MCP client wraps Anthropic's Model Context Protocol SDK. Tool registration happens at gateway startup — each microservice registers its available tools with the gateway's MCP client pool. Key files:

- `server/src/mcp/client-pool.ts` — connection pooling, one persistent connection per MCP server
- `server/src/mcp/tool-registry.ts` — maps GraphQL resolver fields to MCP tool names
- `server/src/mcp/retry-handler.ts` — exponential backoff with jitter, max 3 retries
- `server/src/mcp/cache-interceptor.ts` — Redis cache layer, wraps every tool invocation

The hardest part of this was handling partial failures — when 2 of 4 MCP servers respond and 2 timeout. GraphQL partial responses (`data` + `errors`) handle this, but it required careful resolver design so frontend could render what it had.

---

## GraphQL Schema Design
**Where:** `server/src/schema/`

Schema-first development. The `.graphql` files are the source of truth — TypeScript types are generated from them via `graphql-codegen`. This means the frontend and backend share the same types from a single source.

- `server/src/schema/query.graphql` — all read operations
- `server/src/schema/mutation.graphql` — all write operations, all idempotent
- `server/src/schema/directives/` — custom `@auth`, `@rateLimit`, `@complexity` directives
- `server/src/schema/scalars/` — custom `DateTime`, `JSON`, `UUID` scalars

Complexity limiting is defined inline on expensive fields:
```graphql
type Query {
  llmQuery(input: LLMQueryInput!): LLMResult @complexity(value: 100)
  analyticsReport(range: DateRange!): Report @complexity(value: 50)
}
```

---

## LLM Router
**Where:** `services/llm-router-service/src/`

The router is the only service allowed to call GPT-4 or Gemini. It receives a normalized `LLMRequest` from MCP, selects the provider based on `LLM_PROVIDER` env var, and returns a normalized `LLMResponse`. Neither the gateway nor other services know which provider was used.

- `services/llm-router-service/src/router.ts` — provider selection logic
- `services/llm-router-service/src/providers/openai.ts` — GPT-4 adapter
- `services/llm-router-service/src/providers/gemini.ts` — Gemini adapter
- `services/llm-router-service/src/schemas/` — Zod validation on all LLM responses

The Zod validation step is not optional. Every LLM response is unpredictable — the schema validation ensures the gateway never returns unstructured AI output to the frontend.

---

## Apollo Client Optimization
**Where:** `client/src/graphql/`

Three specific optimizations worth understanding:

**1. Normalized cache with field policies**
`client/src/graphql/cache.ts` defines field policies for pagination and for LLM results (which are never cached client-side — `fetchPolicy: 'no-cache'` for all LLM queries).

**2. Query batching**
Apollo Client is configured with `BatchHttpLink` — multiple queries fired within the same event loop tick are batched into a single HTTP request. This is what drives the 60% reduction in API calls.

**3. Optimistic updates**
Mutations that update user preferences write optimistically to the cache before the server confirms. Rollback on error is handled in `client/src/graphql/optimistic/`.

---

## Authentication
**Where:** `server/src/middleware/auth.ts`, `services/auth-service/`

JWT with refresh token rotation. Access tokens expire in 15 minutes. Refresh tokens expire in 7 days and are rotated on every use (previous token is invalidated immediately).

The gateway validates the JWT on every request. It does NOT call the auth service on every request — the JWT is verified locally using the public key. The auth service is only called to issue, refresh, or revoke tokens.

Token storage: access token in memory (React state), refresh token in `HttpOnly` cookie. Never `localStorage`.

---

## Infrastructure
**Where:** `infra/`

Terraform modules for all AWS resources. Nothing is click-ops.

- `infra/modules/ecs/` — ECS cluster, task definitions, service auto-scaling
- `infra/modules/rds/` — PostgreSQL on RDS Multi-AZ, automated backups
- `infra/modules/elasticache/` — Redis cluster, one replica
- `infra/modules/alb/` — Application Load Balancer, target groups, health checks
- `infra/modules/iam/` — task roles, Parameter Store read permissions

Secrets (API keys, DB passwords) live in AWS Parameter Store under `/querybridge/<env>/<secret-name>`. ECS task role has `ssm:GetParameters` permission scoped to `/querybridge/*`. No secrets in environment variables, no secrets in Terraform state.

---

## CI/CD Pipeline
**Where:** `.github/workflows/`

Three pipelines:

**`ci.yml`** — runs on every PR
1. Lint (ESLint + Prettier)
2. Type check (`tsc --noEmit`)
3. Unit tests
4. Integration tests (spins up Docker Compose)
5. Build Docker images (does not push)

**`deploy-staging.yml`** — runs on merge to `main`
1. All CI steps
2. Push images to ECR
3. Update ECS task definitions
4. Wait for ECS deployment to stabilize
5. Run smoke tests against staging

**`deploy-prod.yml`** — manual trigger only, requires approval
1. Promote staging image tags to production
2. Blue/green deployment via ECS
3. Automated rollback if p99 latency > 800ms within 5 minutes of deploy

---

## Testing Strategy
**Where:** `tests/`

**Unit tests** (`tests/unit/`) — fast, no I/O
- All resolvers tested with mocked MCP clients
- LLM router tested with stubbed provider responses
- Auth middleware tested with valid/expired/malformed JWTs
- Complexity guard tested with known expensive queries

**Integration tests** (`tests/integration/`) — requires `docker-compose up`
- Full GraphQL operation tests against real PostgreSQL and Redis
- MCP tool invocations against real service containers
- Auth flow: register → login → refresh → revoke

**Load tests** (`tests/load/`) — k6 scripts
- `mcp-latency.js` — validates p99 < 200ms under 50 concurrent users
- `graphql-throughput.js` — validates gateway handles 500 RPS without error rate spike
- Run manually before production deploys: `k6 run tests/load/mcp-latency.js`

---

## Known Footguns

**1. MCP client pool exhaustion**
If all 10 connections to an MCP server are in use, new requests queue. Queue timeout is 5 seconds. Under extreme load, requests fail with `MCP_POOL_EXHAUSTED`. Increase `MCP_POOL_SIZE` if you see this in logs — but check why traffic spiked first.

**2. GraphQL N+1 in nested resolvers**
DataLoader is set up for `user` and `session` types. If you add a new type that resolves a list of objects with nested fields, add a DataLoader or you'll hit N+1 immediately. The integration test `tests/integration/n-plus-one.test.ts` will catch it.

**3. Gemini response format differences**
Gemini returns `candidates[0].content.parts[0].text` while GPT-4 returns `choices[0].message.content`. The provider adapters normalize this. If you add a new LLM provider, add an adapter — do not handle response format differences in the router.

**4. Redis key collisions across environments**
All Redis keys are prefixed with `QB:<env>:`. If `REDIS_ENV_PREFIX` is not set, it defaults to `development`. In production this env var must be explicitly set to `production` — it does not inherit from `NODE_ENV`.
