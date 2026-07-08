import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { uploadJUnitToXray } from "../services/xray.js";
import { runCommand } from "../services/exec.js";

export function registerXrayTools(server: McpServer): void {
  server.registerTool(
    "pek_upload_to_xray",
    {
      title: "Upload JUnit results to Xray",
      description: `Uploads a JUnit XML report to Xray Cloud, creating a Test Execution attached to a Jira Test Plan. Cross-platform TypeScript port of scripts/upload-xray.ps1 (same API flow: authenticate, then POST /api/v2/import/execution/junit).

Before uploading, orphan test_key properties are stripped via scripts/remove-test-keys.js (same behaviour as the PowerShell script), so tests not yet created in Jira don't break the import.

Args:
  - testPlanKey (string): Jira Test Plan key, e.g. "MYPROJECT-100"
  - projectKey (string): Jira project key, e.g. "MYPROJECT" (defaults to env JIRA_PROJECT_KEY)
  - reportPath (string, default "xray-report.xml"): JUnit file, relative to the repo root
  - endpoint (string, optional): Xray endpoint (defaults to env XRAY_ENDPOINT or xray.cloud.getxray.app)

Returns: { execKey, reportPath, importUrl } where execKey is the created Test Execution (e.g. "MYPROJECT-142").

Requires env: XRAY_CLIENT_ID, XRAY_CLIENT_SECRET.
Creates a new Test Execution in Jira on every call (not idempotent).`,
      inputSchema: {
        testPlanKey: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'Must be a Jira issue key like "PROJ-100"')
          .describe("Jira Test Plan key"),
        projectKey: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*$/, 'Must be a Jira project key like "PROJ"')
          .optional()
          .describe("Jira project key (defaults to env JIRA_PROJECT_KEY)"),
        reportPath: z
          .string()
          .default("xray-report.xml")
          .describe("Path to the JUnit XML, relative to repo root"),
        endpoint: z.string().optional().describe("Xray Cloud endpoint host"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ testPlanKey, projectKey, reportPath, endpoint }) => {
      const resolvedProjectKey = projectKey ?? process.env.JIRA_PROJECT_KEY;
      if (!resolvedProjectKey) {
        return {
          content: [
            {
              type: "text",
              text: "No project key: pass 'projectKey' or set the JIRA_PROJECT_KEY environment variable.",
            },
          ],
          isError: true,
        };
      }

      // Same pre-processing as upload-xray.ps1: drop orphan test_key properties.
      const cleanup = await runCommand("node", ["scripts/remove-test-keys.js", reportPath], {
        timeoutMs: 30_000,
      });
      const cleanupNote =
        cleanup.exitCode === 0
          ? "Orphan test_key properties removed."
          : `Warning: remove-test-keys.js failed (continuing anyway): ${cleanup.stderr.trim()}`;

      try {
        const result = await uploadJUnitToXray({
          reportPath,
          testPlanKey,
          projectKey: resolvedProjectKey,
          endpoint,
        });

        return {
          content: [
            {
              type: "text",
              text:
                `Test Execution created: ${result.execKey} (Test Plan ${testPlanKey})\n` +
                `${cleanupNote}\n${JSON.stringify(result, null, 2)}`,
            },
          ],
          structuredContent: { ...result },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Xray upload failed: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
