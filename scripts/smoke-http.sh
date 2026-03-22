#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

QUERY_PORT=4101
AUTH_PORT=4102
LLM_PORT=4103
ANALYTICS_PORT=4104
GATEWAY_PORT=4100

PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT

wait_for_url() {
  local url="$1"
  local attempts=40
  local sleep_seconds=0.25

  for ((i=1; i<=attempts; i++)); do
    if curl -sf "$url" >/dev/null; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "Timed out waiting for $url" >&2
  return 1
}

wait_for_http_reachable() {
  local url="$1"
  local attempts=40
  local sleep_seconds=0.25

  for ((i=1; i<=attempts; i++)); do
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)"
    if [[ "$code" != "000" ]]; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "Timed out waiting for reachable HTTP endpoint: $url" >&2
  return 1
}

echo "Building project..."
npm run build >/dev/null

echo "Starting services on isolated smoke-test ports..."
PORT="$QUERY_PORT" npx tsx "services/query-service/src/server.ts" >/tmp/querybridge-query.log 2>&1 &
PIDS+=("$!")
PORT="$AUTH_PORT" npx tsx "services/auth-service/src/server.ts" >/tmp/querybridge-auth.log 2>&1 &
PIDS+=("$!")
PORT="$LLM_PORT" npx tsx "services/llm-router-service/src/server.ts" >/tmp/querybridge-llm.log 2>&1 &
PIDS+=("$!")
PORT="$ANALYTICS_PORT" npx tsx "services/analytics-service/src/server.ts" >/tmp/querybridge-analytics.log 2>&1 &
PIDS+=("$!")

MCP_TRANSPORT_MODE=http \
QUERY_SERVICE_URL="http://localhost:${QUERY_PORT}" \
AUTH_SERVICE_URL="http://localhost:${AUTH_PORT}" \
LLM_ROUTER_SERVICE_URL="http://localhost:${LLM_PORT}" \
ANALYTICS_SERVICE_URL="http://localhost:${ANALYTICS_PORT}" \
PORT="$GATEWAY_PORT" \
npx tsx "server/src/index.ts" >/tmp/querybridge-gateway.log 2>&1 &
PIDS+=("$!")

wait_for_url "http://localhost:${QUERY_PORT}/health"
wait_for_url "http://localhost:${AUTH_PORT}/health"
wait_for_url "http://localhost:${LLM_PORT}/health"
wait_for_url "http://localhost:${ANALYTICS_PORT}/health"
wait_for_http_reachable "http://localhost:${GATEWAY_PORT}/"

echo "Running GraphQL smoke query..."
RESPONSE="$(curl -s -X POST "http://localhost:${GATEWAY_PORT}/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer smoke-token" \
  -d '{"query":"query($range:String!,$p:String!){ health { ok service } viewer { id email } llmQuery(input:{prompt:$p}){ text provider model } analyticsSummary(range:$range){ range totalQueries errorRate p95Ms } }","variables":{"range":"7d","p":"smoke-http"}}')"

RESPONSE_JSON="$RESPONSE" node -e "
const response = JSON.parse(process.env.RESPONSE_JSON);
if (response.errors && response.errors.length > 0) {
  console.error('Smoke query returned errors:', JSON.stringify(response.errors));
  process.exit(1);
}
if (!response.data?.health?.ok) process.exit(1);
if (!response.data?.viewer?.id) process.exit(1);
if (!response.data?.llmQuery?.text) process.exit(1);
if (!response.data?.analyticsSummary?.range) process.exit(1);
"

echo "HTTP smoke test passed."
