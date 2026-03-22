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

function buildViewerResult(userId: string) {
  return {
    id: userId,
    email: `${userId}@querybridge.local`
  };
}

async function viewerTool(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const args =
    typeof body.args === "object" && body.args !== null
      ? (body.args as Record<string, unknown>)
      : {};
  const userId = typeof args.userId === "string" ? args.userId : "anonymous";

  sendJson(res, 200, {
    result: buildViewerResult(userId)
  });
}

async function handleMcpCall(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (body.toolName !== "get-viewer") {
    sendJson(res, 400, { error: "Unsupported toolName" });
    return;
  }

  const args =
    typeof body.args === "object" && body.args !== null
      ? (body.args as Record<string, unknown>)
      : {};
  const userId = typeof args.userId === "string" ? args.userId : "anonymous";
  sendJson(res, 200, { result: buildViewerResult(userId) });
}

async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? "/").split("?")[0];

  if (path === "/health") {
    sendJson(res, 200, { ok: true, service: "auth-service" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  if (path === "/mcp/tools/get-viewer" || path === "/tools/get-viewer") {
    await viewerTool(req, res);
    return;
  }

  if (path === "/mcp/call") {
    await handleMcpCall(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
}

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 4002);
  const server = createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      sendJson(res, 500, {
        error: "auth-service request failed",
        details: error instanceof Error ? error.message : "unknown"
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`auth-service ready at http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error("auth-service failed to start", error);
  process.exit(1);
});
