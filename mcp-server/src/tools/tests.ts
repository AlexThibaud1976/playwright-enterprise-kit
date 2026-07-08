import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runCommand } from "../services/exec.js";
import { DEFAULT_RUN_TIMEOUT_S, PEK_ROOT, filterExtraEnv, truncate } from "../constants.js";

interface RunSummary {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

/** Parses the tail of Playwright's list reporter output ("12 passed (34s)", "2 failed", ...). */
function parseListReporterSummary(output: string): RunSummary {
  const summary: RunSummary = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  const patterns: Array<[keyof RunSummary, RegExp]> = [
    ["passed", /(\d+)\s+passed/],
    ["failed", /(\d+)\s+failed/],
    ["flaky", /(\d+)\s+flaky/],
    ["skipped", /(\d+)\s+skipped/],
  ];
  for (const [key, regex] of patterns) {
    const match = output.match(regex);
    if (match) summary[key] = parseInt(match[1], 10);
  }
  return summary;
}

export function registerTestTools(server: McpServer): void {
  server.registerTool(
    "pek_run_tests",
    {
      title: "Run Playwright tests",
      description: `Runs the kit's Playwright test suite ('npx playwright test' from the repo root) and returns the exit code, a pass/fail summary and the tail of the output.

Reporters defined in playwright.config are intentionally NOT overridden, so artefacts such as xray-report.xml (JUnit for Xray) and the HTML report are still produced and can be uploaded afterwards with pek_upload_to_xray.

Args:
  - grep (string, optional): only run tests whose title matches this pattern (--grep)
  - testPath (string, optional): file or directory to run, relative to the repo root (e.g. "tests/example/")
  - project (string, optional): Playwright project name (--project)
  - config (string, optional): alternate config file, e.g. "playwright.config.browserstack.js"
  - headed (boolean, default false): run with a visible browser
  - extraEnv (record<string,string>, optional): extra environment variables. Only BS_*, DEVICE_NAME, BASE_URL, HEADLESS, TEST_TIMEOUT and BROWSERSTACK_BUILD_NAME are accepted (e.g. BS_* values from pek_resolve_browserstack_config)
  - timeoutSeconds (number, default ${DEFAULT_RUN_TIMEOUT_S}): kill the run after this delay

Returns: { exitCode, passed, failed, flaky, skipped, durationMs, timedOut, outputTail }

Example: "run the smoke tests" -> { grep: "@smoke" }
Note: BrowserStack runs can be long; raise timeoutSeconds for large campaigns.`,
      inputSchema: {
        grep: z.string().min(1).optional().describe("Pattern for --grep"),
        testPath: z.string().min(1).optional().describe("Test file/dir relative to repo root"),
        project: z.string().min(1).optional().describe("Playwright project name"),
        config: z.string().min(1).optional().describe("Alternate playwright config file"),
        headed: z.boolean().default(false).describe("Run headed browsers"),
        extraEnv: z.record(z.string()).optional().describe("Extra environment variables for the run (whitelisted keys only)"),
        timeoutSeconds: z
          .number()
          .int()
          .min(30)
          .max(7200)
          .default(DEFAULT_RUN_TIMEOUT_S)
          .describe("Max run duration in seconds"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ grep, testPath, project, config, headed, extraEnv, timeoutSeconds }) => {
      // extraEnv whitelist: prevents NODE_OPTIONS / PATH style overrides that
      // would turn a test run into arbitrary code execution.
      const { env: safeExtraEnv, rejected } = filterExtraEnv(extraEnv);
      if (rejected.length > 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `Rejected extraEnv keys: ${rejected.join(", ")}. ` +
                "Only BS_*, DEVICE_NAME, BASE_URL, HEADLESS, TEST_TIMEOUT and " +
                "BROWSERSTACK_BUILD_NAME are allowed.",
            },
          ],
          isError: true,
        };
      }

      // Invoke the Playwright CLI directly through node (cross-platform,
      // no shell involved) instead of npx, which would require shell: true
      // on Windows and reopen an injection vector.
      const cliPath = path.join(PEK_ROOT, "node_modules", "playwright", "cli.js");
      if (!fs.existsSync(cliPath)) {
        return {
          content: [
            {
              type: "text",
              text:
                `Playwright CLI not found at ${cliPath}. ` +
                "Run 'npm install' at the kit root first.",
            },
          ],
          isError: true,
        };
      }

      const args = [cliPath, "test"];
      if (testPath) args.push(testPath);
      if (grep) args.push("--grep", grep);
      if (project) args.push("--project", project);
      if (config) args.push(`--config=${config}`);
      if (headed) args.push("--headed");

      const result = await runCommand("node", args, {
        timeoutMs: timeoutSeconds * 1000,
        env: { ...process.env, ...safeExtraEnv },
      });

      const combined = result.stdout + "\n" + result.stderr;
      const summary = parseListReporterSummary(combined);
      const output = {
        exitCode: result.exitCode,
        ...summary,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        outputTail: truncate(combined.slice(-6000), 6000),
      };

      const headline = result.timedOut
        ? `Run timed out after ${timeoutSeconds}s`
        : result.exitCode === 0
          ? `Run PASSED: ${summary.passed} passed`
          : `Run FAILED (exit ${result.exitCode}): ${summary.failed} failed, ${summary.passed} passed`;

      return {
        content: [{ type: "text", text: `${headline}\n\n${JSON.stringify(output, null, 2)}` }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "pek_get_last_run_summary",
    {
      title: "Get last run artefacts",
      description: `Inspects the repo for artefacts of the most recent Playwright run, without executing anything.

Checks for: xray-report.xml (JUnit for Xray), playwright-report/ (HTML report) and test-results/ (traces, screenshots), with their modification times.

Returns: { artefacts: [{ name, path, exists, modifiedAt, sizeBytes }] }

Use it before pek_upload_to_xray to confirm the JUnit report is fresh.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const candidates = ["xray-report.xml", "playwright-report", "test-results"];
      const artefacts = candidates.map((name) => {
        const fullPath = path.join(PEK_ROOT, name);
        try {
          const stat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            exists: true,
            modifiedAt: stat.mtime.toISOString(),
            sizeBytes: stat.isFile() ? stat.size : null,
          };
        } catch {
          return { name, path: fullPath, exists: false, modifiedAt: null, sizeBytes: null };
        }
      });

      const output = { artefacts };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
