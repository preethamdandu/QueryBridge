import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type JsonObject = Record<string, unknown>;

function sendJson(res: ServerResponse, statusCode: number, payload: JsonObject): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as JsonObject;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function buildSummary(range: string) {
  return {
    range,
    totalQueries: 42,
    errorRate: 0.002,
    p95Ms: 320
  };
}

async function summaryTool(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const args =
    typeof body.args === "object" && body.args !== null
      ? (body.args as Record<string, unknown>)
      : {};
  const range = typeof args.range === "string" ? args.range : "24h";

  sendJson(res, 200, {
    result: buildSummary(range)
  });
}

async function handleMcpCall(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (body.toolName !== "summary") {
    sendJson(res, 400, { error: "Unsupported toolName" });
    return;
  }

  const args =
    typeof body.args === "object" && body.args !== null
      ? (body.args as Record<string, unknown>)
      : {};
  const range = typeof args.range === "string" ? args.range : "24h";
  sendJson(res, 200, { result: buildSummary(range) });
}

async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? "/").split("?")[0];

  if (path === "/health") {
    sendJson(res, 200, { ok: true, service: "analytics-service" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  if (path === "/mcp/tools/summary" || path === "/tools/summary") {
    await summaryTool(req, res);
    return;
  }

  if (path === "/mcp/call") {
    await handleMcpCall(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
}

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 4004);
  const server = createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      sendJson(res, 500, {
        error: "analytics-service request failed",
        details: error instanceof Error ? error.message : "unknown"
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`analytics-service ready at http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error("analytics-service failed to start", error);
  process.exit(1);
});
