# QueryBridge

Initial monorepo scaffold for the QueryBridge platform described in `CLAUDE (1).md` and `SKILLS (1).md`.

## Current status

- Workspace layout created (`server`, `client`, `services/llm-router-service`)
- GraphQL gateway now uses schema-first `.graphql` files and directive wiring
- MCP integration layer includes client pool, retry, cache interceptor, and resolver mapping
- MCP transport supports HTTP service calls (with local stub mode for development)
- LLM router starter with provider adapter interfaces
- Local PostgreSQL and Redis via Docker Compose

## Quick start

1. Install dependencies:
   - `npm install`
2. Copy environment:
   - `cp .env.example .env`
3. Start infrastructure:
   - `docker-compose up -d postgres redis`
4. Start gateway:
   - `npm run dev:gateway`
5. Start router service:
   - `npm run dev:llm-router`

### MCP transport modes

- `MCP_TRANSPORT_MODE=stub` (default): local in-process mock responses
- `MCP_TRANSPORT_MODE=http`: gateway calls service endpoints from `*_SERVICE_URL` env vars
- `llm-router-service` HTTP MCP endpoints available:
  - `POST /mcp/tools/route-llm-query`
  - `POST /tools/route-llm-query`
  - `POST /mcp/call` with `toolName: "route-llm-query"`
  - `GET /health`
- `query-service` HTTP MCP endpoints available:
  - `POST /mcp/tools/health`
  - `POST /tools/health`
  - `POST /mcp/call` with `toolName: "health"`
  - `GET /health`
- `auth-service` HTTP MCP endpoints available:
  - `POST /mcp/tools/get-viewer`
  - `POST /tools/get-viewer`
  - `POST /mcp/call` with `toolName: "get-viewer"`
  - `GET /health`
- `analytics-service` HTTP MCP endpoints available:
  - `POST /mcp/tools/summary`
  - `POST /tools/summary`
  - `POST /mcp/call` with `toolName: "summary"`
  - `GET /health`

## Rules carried into code

- No direct provider calls outside `services/llm-router-service`
- Gateway only accesses external capabilities through the MCP layer
- Keep idempotency and complexity guard concerns in middleware/schema design
- LLM responses must be schema-validated before returning to clients

## Current GraphQL operations

- `Query.health`
- `Query.viewer` (`@auth` protected)
- `Query.llmQuery(input)` (`@complexity`)
- `Query.analyticsSummary(range)` (`@complexity`)
- `Mutation.upsertPreference(input)` (`@auth`, idempotency key required)

## Integration tests

- `npm run test:integration`
- Covers:
  - retry behavior for transient MCP failures
  - partial GraphQL response when one MCP resolver fails

## HTTP smoke test

- `npm run test:smoke:http`
- Builds the project, starts gateway + all 4 services on isolated local ports, runs one end-to-end GraphQL query, then shuts everything down.

## Next implementation milestones

1. Wire real GraphQL schema files and codegen.
2. Connect Redis cache interceptor and PostgreSQL persistence.
3. Implement auth service integration and JWT verification.
4. Add integration tests for partial MCP failures and retry behavior.
