export type MCPServerName =
  | "query-service"
  | "auth-service"
  | "llm-router-service"
  | "analytics-service";

export type ToolArgs = Record<string, unknown>;
export type ToolResult = Record<string, unknown>;

export type MCPClient = {
  callTool: (toolName: string, args: ToolArgs) => Promise<ToolResult>;
};

export class MCPClientPool {
  private readonly clients = new Map<MCPServerName, MCPClient>();

  register(server: MCPServerName, client: MCPClient): void {
    this.clients.set(server, client);
  }

  get(server: MCPServerName): MCPClient {
    const client = this.clients.get(server);
    if (!client) {
      throw new Error(`MCP client not registered for ${server}`);
    }
    return client;
  }
}
