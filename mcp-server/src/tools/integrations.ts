import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseLastJsonLine, runCommand } from "../services/exec.js";
import { truncate } from "../constants.js";

/**
 * Generic, tool-agnostic integration tools. Like the other tools they wrap the
 * kit scripts (scripts/pek-doctor.js, scripts/pek-publish.js), so the
 * integration registry in integrations/ stays the single source of truth and
 * any provider added to the kit (built-in or plugin) is reachable here
 * without changing the server.
 */

const PROVIDER_NAME = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Provider names are kebab-case, e.g. 'slack' or 'zephyr-scale'");

interface PublishSummary {
  status: string;
  stats: Record<string, number>;
  grid: string;
  runResult: string;
  links: Array<{ kind: string; label: string; url: string }>;
  results: Array<{ kind: string; provider: string; status: string; message: string; key: string | null; url: string | null }>;
}

export function registerIntegrationTools(server: McpServer): void {
  server.registerTool(
    "pek_list_integrations",
    {
      title: "List kit integrations",
      description: `Lists every integration known to the kit and whether it is configured and active. Wraps scripts/pek-doctor.js.

Three kinds of providers:
  - grid: where browsers run (local, browserstack, lambdatest, remote, + plugins)
  - test-management: where results are stored (xray, zephyr-scale, testrail, qase, + plugins)
  - publisher: who is notified (github-summary, confluence, slack, teams, webhook, + plugins)

Selection comes from PEK_GRID / PEK_TEST_MANAGEMENT / PEK_PUBLISHERS, then pek.config.js, then 'auto' (every provider whose credentials are present).

Returns: { selection, providers: [{ kind, name, label, configured, active, missingEnv[], optionalEnv[], docs }] }
Only variable NAMES are returned, never secret values.

Use it first to know what pek_run_tests / pek_publish_results will do.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await runCommand("node", ["scripts/pek-doctor.js", "--json"], { timeoutMs: 30_000 });
      const info = result.exitCode === 0 ? parseLastJsonLine<Record<string, unknown>>(result.stdout) : null;
      if (!info) {
        return {
          content: [
            {
              type: "text",
              text: "Could not read the integration registry:\n" + truncate(result.stdout + "\n" + result.stderr, 4000),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
        structuredContent: info,
      };
    }
  );

  server.registerTool(
    "pek_publish_results",
    {
      title: "Publish last run to integrations",
      description: `Builds run-result.json from the last run (test-results.json, or xray-report.xml as fallback) and sends it to the active test-management tools, then to the active publishers. Wraps scripts/pek-publish.js.

Works with zero integration configured (it then only writes run-result.json). A failing provider never blocks the others; each one reports ok | skipped | error.

Args:
  - scope (string, optional): scope label shown everywhere (default "All Tests")
  - testPlanKey (string, optional): Xray Test Plan key, e.g. "PROJ-100"
  - only (string[], optional): restrict to these provider names (any kind), e.g. ["slack"]
  - exclude (string[], optional): skip these providers, e.g. ["confluence"]
  - links (record<label,url>, optional): extra links for publishers, e.g. {"BrowserStack": "https://..."}. Prefix the label with "grid:" to mark it as the grid build link.
  - dryRun (boolean, default false): build run-result.json and show what WOULD be published, without any remote call

Returns: { status, stats, grid, runResult, links[], results[{ kind, provider, status, message, key, url }] }

Not idempotent: each non-dry call creates remote resources (Test Executions, runs, messages...). Prefer dryRun first when unsure.`,
      inputSchema: {
        scope: z.string().min(1).optional().describe("Scope label"),
        testPlanKey: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'Must be a Jira issue key like "PROJ-100"')
          .optional()
          .describe("Xray Test Plan key"),
        only: z.array(PROVIDER_NAME).optional().describe("Only these providers"),
        exclude: z.array(PROVIDER_NAME).optional().describe("Skip these providers"),
        links: z.record(z.string().min(1), z.string().url()).optional().describe("Extra links: label -> url"),
        dryRun: z.boolean().default(false).describe("Do not call any remote service"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ scope, testPlanKey, only, exclude, links, dryRun }) => {
      const args = ["scripts/pek-publish.js", "--json"];
      if (scope) args.push("--scope", scope);
      if (testPlanKey) args.push("--test-plan", testPlanKey);
      if (only && only.length) args.push("--only", only.join(","));
      if (exclude && exclude.length) args.push("--exclude", exclude.join(","));
      for (const [label, url] of Object.entries(links ?? {})) args.push("--link", `${label}=${url}`);
      if (dryRun) args.push("--dry-run");

      const result = await runCommand("node", args, { timeoutMs: 300_000 });
      const summary = parseLastJsonLine<PublishSummary>(result.stdout);

      if (result.exitCode !== 0 || !summary) {
        return {
          content: [
            {
              type: "text",
              text: "Publication failed:\n" + truncate(result.stdout + "\n" + result.stderr, 4000),
            },
          ],
          isError: true,
        };
      }

      const lines = summary.results.map(
        (r) => `- ${r.provider} (${r.kind}): ${r.status}${r.key ? ` ${r.key}` : ""}${r.message ? ` - ${r.message}` : ""}`
      );
      const headline =
        `Run ${summary.status} (${summary.stats.passed}/${summary.stats.total} passed, grid ${summary.grid})` +
        (lines.length ? `\n${lines.join("\n")}` : "\nNo integration selected: run-result.json written only.");

      return {
        content: [{ type: "text", text: `${headline}\n\n${JSON.stringify(summary, null, 2)}` }],
        structuredContent: { ...summary },
      };
    }
  );
}
