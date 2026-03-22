# CLAUDE.md — QueryBridge

> Read this before touching any code. This document captures decisions made, pain learned, and constraints that must not be violated.

---

## What This System Does

QueryBridge is an AI-first SaaS platform that lets LLMs invoke external microservices through MCP (Model Context Protocol) servers. A GraphQL gateway sits between the React frontend and 4 backend services, enabling the frontend to fetch everything in a single typed request. LLM provider (GPT-4 or Gemini) is configurable at runtime.

The core problem it solves: **LLM tool calls are stateless and brittle.** Without a protocol layer, every new tool integration requires prompt changes, new error handling, and manual retries. MCP standardizes this.

---

## Architecture

```
Browser (React + Apollo Client)
        │
        │  GraphQL over HTTP
        ▼
Apollo Server (GraphQL Gateway)          ← single entry point
        │
        ├── Auth Middleware (JWT)
        ├── Rate Limiter (per-user, per-query-type)
        ├── Query Complexity Guard (max depth: 7, max cost: 1000)
        │
        ├── Resolver: QueryService    ──► MCP Server A (query-service:4001)
        ├── Resolver: AuthService     ──► MCP Server B (auth-service:4002)
        ├── Resolver: LLMRouter       ──► MCP Server C (llm-router-service:4003)
        └── Resolver: AnalyticsService──► MCP Server D (analytics-service:4004)
                                                  │
                                          ┌───────┴────────┐
                                          ▼                ▼
                                    OpenAI GPT-4      Google Gemini
                                    (primary)         (fallback/A-B)

        PostgreSQL (RDS)  ◄──────── all services write here
        Redis (ElastiCache) ◄────── MCP response cache (TTL: 30s)
```

**Critical constraint:** The LLM Router never calls GPT-4 or Gemini directly from a resolver. All LLM calls go through `llm-router-service` via MCP. This is enforced by ESLint rule — any direct `openai.chat.completions.create()` call outside `llm-router-service/` will fail CI.

---

## Architecture Decision Records

### ADR-001: MCP over Direct Tool Calls
**Decision:** All LLM tool integrations use MCP servers, not direct function calls.

**Context:** Early prototype called tools directly in resolvers. Every service change required prompt updates. Two engineers were editing prompts to fix what were essentially API contract changes.

**Rejected alternatives:**
- LangChain function calling — too opinionated, locks us into LangChain's abstraction layer
- OpenAI function calling directly — provider-specific, breaks when switching to Gemini
- REST webhooks — no standardized error handling, each tool needed bespoke retry logic

**Consequences:** MCP adds ~15ms overhead per tool call. Accepted. The decoupling benefit outweighs it.

---

### ADR-002: GraphQL Gateway over BFF per Service
**Decision:** Single Apollo Server gateway, not a Backend-for-Frontend per service.

**Context:** Frontend was making 4 sequential REST calls per page load (auth check → query → analytics → LLM result). P99 was 800ms because each call waited on the previous.

**Rejected alternatives:**
- REST aggregation endpoint — would have become a dumping ground, no schema enforcement
- gRPC-Web — browser support is immature, requires Envoy proxy

**Consequences:** Gateway becomes a single point of failure. Mitigated by: health checks, circuit breakers on each resolver, and ECS auto-scaling.

---

### ADR-003: PostgreSQL over DynamoDB
**Decision:** PostgreSQL on RDS, not DynamoDB.

**Context:** Early design assumed DynamoDB for scale. But query patterns are relational — LLM sessions reference users reference queries. Modeling this in DynamoDB required duplicating data across 3 tables and made analytics queries unreadable.

**Rejected:** DynamoDB — flexible at write time, painful at read time for our access patterns.

**Consequences:** Vertical scaling ceiling. Mitigated with read replicas and Redis caching for hot paths.

---

### ADR-004: Redis Cache for MCP Responses
**Decision:** Cache MCP tool responses in Redis with 30s TTL.

**Context:** Identical tool invocations were hitting downstream services repeatedly within short windows. Analytics queries especially — same user requesting same data 3x in 30 seconds.

**TTL reasoning:** 30s is short enough that stale data is acceptable for analytics, long enough to absorb burst traffic. LLM responses are NOT cached (non-deterministic by design).

---

## Observability

### What We Measure
Every MCP tool invocation emits:
```typescript
{
  tool: string,           // which MCP server
  latency_ms: number,     // wall clock
  status: 'success' | 'timeout' | 'error',
  llm_provider: string,   // gpt-4 | gemini
  cache_hit: boolean,
  user_id: string         // hashed
}
```

GraphQL resolver metrics via Apollo Studio:
- Field-level latency (p50, p95, p99)
- Error rate per operation
- Cache hit rate

### SLOs
| SLO | Target | Alert Threshold |
|---|---|---|
| MCP tool latency p99 | < 200ms | > 250ms for 5min |
| GraphQL gateway error rate | < 0.1% | > 0.5% for 2min |
| LLM router availability | > 99.5% | < 99% for 10min |
| End-to-end query p95 | < 500ms | > 800ms for 5min |

### Dashboards
- CloudWatch: infrastructure metrics (CPU, memory, RDS connections)
- Apollo Studio: GraphQL operation analytics
- Custom: MCP latency heatmap by tool and provider

---

## Failure Modes & Runbook

### MCP Server Unreachable
**Symptom:** GraphQL resolver returns partial data, `extensions.errors` contains MCP timeout.

**Root cause:** Usually a crashed service container or network partition in VPC.

**Response:**
1. Check ECS service health: `aws ecs describe-services --cluster querybridge-prod`
2. Check service logs: `aws logs tail /querybridge/<service-name>`
3. If crashed: ECS auto-restart handles it within 30s. If not restarting, check task definition memory limits.
4. Fallback: GraphQL resolvers return `null` for MCP-dependent fields — frontend degrades gracefully.

---

### LLM Provider Outage (GPT-4 Down)
**Symptom:** `llm-router-service` logs show `openai_error: 503`.

**Response:**
1. Set env var: `LLM_PROVIDER=gemini` in ECS task definition
2. Redeploy: `aws ecs update-service --force-new-deployment`
3. Takes ~90s to propagate. No data loss — in-flight requests fail, clients retry.
4. Monitor Gemini latency — it runs ~40ms slower than GPT-4 on average.

---

### GraphQL Query Complexity Attack
**Symptom:** Gateway CPU spike, slow query log shows deeply nested operations.

**Response:**
1. Query complexity guard should have blocked it (max cost: 1000). Check if guard middleware is active.
2. If guard failed: the malicious operation will be in Apollo Studio's slow query log.
3. Add the operation name to the blocklist in `server/src/middleware/complexity-blocklist.ts`.
4. Incident post-mortem: why did the guard miss it?

---

### Redis Cache Stampede
**Symptom:** RDS connection count spikes after Redis restart.

**Root cause:** All cache keys expire simultaneously after Redis comes back, causing thundering herd to PostgreSQL.

**Response:**
1. This should be handled by jitter in TTL (30s ± 5s random). Check `cache/client.ts` — `ttl: 30 + Math.random() * 10`.
2. If stampede is happening anyway: manually set `CACHE_DISABLED=true`, restart services, then re-enable after DB load normalizes.

---

## Hard Rules — Do Not Violate

**1. Never call OpenAI or Gemini outside `llm-router-service/`**
Enforced by ESLint. If you think you need to, you're wrong. Open a discussion first.

**2. Never return raw LLM output to the frontend without schema validation**
All LLM responses pass through Zod schemas before being returned. An unvalidated LLM response that reaches a user is a security incident.

**3. Never skip the complexity guard for "just this one query"**
It has been disabled twice before. Both times caused production incidents. The guard stays on.

**4. Never store secrets in environment variables at the task level**
All secrets go through AWS Parameter Store. The ECS task role has read access. If you're copy-pasting an API key into the ECS console, stop.

**5. GraphQL mutations must be idempotent**
LLM tool calls can be retried. If a mutation isn't idempotent, retries cause duplicate data. Use idempotency keys.

---

## Local Development Setup

```bash
# Prerequisites: Docker Desktop, Node 20+, AWS CLI configured

# 1. Clone and install
git clone https://github.com/preethamdandu/QueryBridge
cd QueryBridge
npm install

# 2. Environment setup
cp .env.example .env
# Fill in OPENAI_API_KEY or GEMINI_API_KEY (one is enough locally)

# 3. Start infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# 4. Run migrations
npm run db:migrate

# 5. Start all services
npm run dev

# Services start on:
# Gateway:            http://localhost:4000/graphql
# query-service:      http://localhost:4001
# auth-service:       http://localhost:4002
# llm-router-service: http://localhost:4003
# analytics-service:  http://localhost:4004
```

### Running Tests
```bash
npm run test              # unit tests
npm run test:integration  # requires docker-compose up
npm run test:load         # k6 load test — requires k6 installed
```

---

## Known Issues & Tech Debt

| Issue | Severity | Owner | Notes |
|---|---|---|---|
| MCP connection pool not drained on shutdown | Medium | — | Causes ~200ms delay on graceful shutdown |
| Apollo Studio trace sampling at 100% in staging | Low | — | Burns Studio quota, reduce to 10% |
| Redis TTL jitter not applied to auth tokens | Medium | — | Low risk today, will matter at scale |
| No dead letter queue for failed MCP retries | High | — | Failed tool calls are silently dropped |
