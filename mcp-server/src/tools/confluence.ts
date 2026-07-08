import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runCommand } from "../services/exec.js";
import { truncate } from "../constants.js";

export function registerConfluenceTools(server: McpServer): void {
  server.registerTool(
    "pek_update_confluence_report",
    {
      title: "Update Confluence test dashboard",
      description: `Appends an execution row to the "Test Execution Dashboard" Confluence page (creates the page if missing, keeps the 50 most recent rows). Wraps scripts/update-confluence-report.js.

Args:
  - execKey (string, optional): Jira Test Execution key (from pek_upload_to_xray)
  - testResult ('PASS' | 'FAIL' | 'UNKNOWN'): overall run result
  - testScope (string, default "All Tests"): human-readable scope label
  - browserstackUrl (string, optional): BrowserStack build URL (from pek_get_browserstack_build_link)
  - extraEnv (record<string,string>, optional): device context (DEVICE_NAME, BS_OS, BS_OS_VERSION, BS_BROWSER, BS_BROWSER_VERSION) shown in the dashboard row

Returns: { pageUrl } of the updated dashboard.

Requires env: CONFLUENCE_URL (ending in /wiki for Atlassian Cloud), CONFLUENCE_USER, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY. Optional: CONFLUENCE_PAGE_TITLE, CONFLUENCE_PARENT_PAGE_ID, JIRA_URL.

Modifies a Confluence page on every call (adds a new history row).`,
      inputSchema: {
        execKey: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'Must be a Jira issue key like "PROJ-142"')
          .optional()
          .describe("Jira Test Execution key"),
        testResult: z.enum(["PASS", "FAIL", "UNKNOWN"]).describe("Overall result"),
        testScope: z.string().default("All Tests").describe("Scope label for the dashboard"),
        browserstackUrl: z.string().url().optional().describe("BrowserStack build URL"),
        extraEnv: z
          .record(z.string())
          .optional()
          .describe("Device context env vars (DEVICE_NAME, BS_OS, ...)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ execKey, testResult, testScope, browserstackUrl, extraEnv }) => {
      const args = [
        "scripts/update-confluence-report.js",
        "--test-result",
        testResult,
        "--test-scope",
        testScope,
      ];
      if (execKey) args.push("--exec-key", execKey);
      if (browserstackUrl) args.push("--browserstack-url", browserstackUrl);

      const result = await runCommand("node", args, {
        timeoutMs: 60_000,
        env: { ...process.env, ...extraEnv },
      });

      const combined = result.stdout + "\n" + result.stderr;

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "Confluence update failed:\n" +
                truncate(combined, 4000) +
                "\nCheck CONFLUENCE_URL (must end with /wiki on Atlassian Cloud), " +
                "CONFLUENCE_USER, CONFLUENCE_API_TOKEN and CONFLUENCE_SPACE_KEY.",
            },
          ],
          isError: true,
        };
      }

      const match = combined.match(/View:\s*(\S+)/);
      const output = { pageUrl: match?.[1] ?? null };

      return {
        content: [
          {
            type: "text",
            text: `Confluence dashboard updated.\n${JSON.stringify(output, null, 2)}`,
          },
        ],
        structuredContent: output,
      };
    }
  );
}
