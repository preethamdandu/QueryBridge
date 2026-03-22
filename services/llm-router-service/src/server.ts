import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { routeLLMRequest } from "./router";
import { llmRequestSchema } from "./schemas/llm-request";

type JsonObject = Record<string, unknown>;

function sendJson(res: ServerResponse, statusCode: number, payload: JsonObject): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { error: "Not Found" });
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

async function handleRouteLLMQuery(
  req: IncomingMessage,
  res: ServerResponse,
  presetBody?: JsonObject
): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  const body = presetBody ?? (await readJsonBody(req));
  const args = typeof body.args === "object" && body.args ? body.args : body;
  const parsedRequest = llmRequestSchema.safeParse(args);
  if (!parsedRequest.success) {
    sendJson(res, 400, {
      error: "Invalid LLM request payload",
      details: parsedRequest.error.issues
    });
    return;
  }

  const result = await routeLLMRequest(parsedRequest.data);
  sendJson(res, 200, { result });
}

async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = req.url ?? "/";
  const path = requestUrl.split("?")[0];

  if (path === "/health") {
    sendJson(res, 200, { ok: true, service: "llm-router-service" });
    return;
  }

  if (path === "/mcp/tools/route-llm-query" || path === "/tools/route-llm-query") {
    await handleRouteLLMQuery(req, res);
    return;
  }

  if (path === "/mcp/call") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    const body = await readJsonBody(req);
    if (body.toolName !== "route-llm-query") {
      sendJson(res, 400, { error: "Unsupported toolName" });
      return;
    }

    await handleRouteLLMQuery(req, res, {
      args: typeof body.args === "object" && body.args ? body.args : {}
    });
    return;
  }

  notFound(res);
}

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 4003);
  const server = createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      sendJson(res, 500, {
        error: "LLM router request failed",
        details: error instanceof Error ? error.message : "unknown"
      });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  console.log(`LLM router service ready at http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error("LLM router failed to start", error);
  process.exit(1);
});
