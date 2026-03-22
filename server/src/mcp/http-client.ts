import type { MCPClient, ToolArgs, ToolResult } from "./client-pool";

type HttpCallResponse = {
  result?: ToolResult;
  error?: string;
};

export class HttpMCPClient implements MCPClient {
  constructor(private readonly baseUrl: string) {}

  async callTool(toolName: string, args: ToolArgs): Promise<ToolResult> {
    const endpoints = [
      `${this.baseUrl}/mcp/tools/${toolName}`,
      `${this.baseUrl}/tools/${toolName}`,
      `${this.baseUrl}/mcp/call`
    ];

    let lastError: unknown;
    for (const endpoint of endpoints) {
      try {
        const payload =
          endpoint.endsWith("/mcp/call") ? { toolName, args } : { args };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${endpoint}`);
        }

        const body = (await response.json()) as HttpCallResponse;
        if (body.error) {
          throw new Error(body.error);
        }

        return body.result ?? (body as ToolResult);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error(`Failed to call MCP tool ${toolName}`);
  }
}
