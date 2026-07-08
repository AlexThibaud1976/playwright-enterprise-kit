#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTestTools } from "./tools/tests.js";
import { registerBrowserStackTools } from "./tools/browserstack.js";
import { registerXrayTools } from "./tools/xray.js";
import { registerConfluenceTools } from "./tools/confluence.js";
import { PEK_ROOT } from "./constants.js";

const server = new McpServer({
  name: "pek-mcp-server",
  version: "0.1.0",
});

registerTestTools(server);
registerBrowserStackTools(server);
registerXrayTools(server);
registerConfluenceTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol on stdio transport -> log to stderr
  console.error(`pek-mcp-server started (kit root: ${PEK_ROOT})`);
}

main().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
});
