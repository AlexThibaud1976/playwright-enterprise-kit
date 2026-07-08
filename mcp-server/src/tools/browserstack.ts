import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseLastJsonLine, runCommand } from "../services/exec.js";
import { truncate } from "../constants.js";

/**
 * These tools wrap the existing kit scripts instead of reimplementing them,
 * so scripts/*.js stay the single source of truth for BrowserStack logic.
 */

interface ResolvedBsConfig {
  BS_OS: string;
  BS_OS_VERSION: string;
  BS_BROWSER: string;
  BS_BROWSER_VERSION: string;
  DEVICE_NAME: string;
}

export function registerBrowserStackTools(server: McpServer): void {
  server.registerTool(
    "pek_resolve_browserstack_config",
    {
      title: "Resolve BrowserStack configuration",
      description: `Validates an OS/browser combination against the BrowserStack API (with local fallback cache) and returns the resolved environment variables. Wraps scripts/resolve-browserstack-config.js.

Args:
  - os ('Windows' | 'Mac'): target operating system
  - osVersion (string): e.g. "11" for Windows, "Sonoma" for Mac
  - browser ('chrome' | 'chromium' | 'firefox' | 'safari' | 'edge')
  - browserVersion (string): e.g. "latest", "latest-1", "131"

Returns: { BS_OS, BS_OS_VERSION, BS_BROWSER, BS_BROWSER_VERSION, DEVICE_NAME }
Pass these values as 'extraEnv' to pek_run_tests with config="playwright.config.browserstack.js".

Requires BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY for live validation; falls back to a local version cache otherwise.

Example: "chrome latest on Windows 11" -> { os: "Windows", osVersion: "11", browser: "chrome", browserVersion: "latest" }`,
      inputSchema: {
        os: z.enum(["Windows", "Mac"]).describe("Target OS"),
        osVersion: z.string().min(1).describe('OS version, e.g. "11" or "Sonoma"'),
        browser: z
          .enum(["chrome", "chromium", "firefox", "safari", "edge"])
          .describe("Target browser"),
        browserVersion: z.string().min(1).describe('Browser version, e.g. "latest" or "131"'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ os, osVersion, browser, browserVersion }) => {
      const result = await runCommand(
        "node",
        [
          "scripts/resolve-browserstack-config.js",
          "--os",
          os,
          "--osVersion",
          osVersion,
          "--browser",
          browser,
          "--browserVersion",
          browserVersion,
        ],
        { timeoutMs: 30_000 }
      );

      if (result.exitCode !== 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "BrowserStack config validation failed:\n" +
                truncate(result.stdout + "\n" + result.stderr, 4000),
            },
          ],
          isError: true,
        };
      }

      const config = parseLastJsonLine<ResolvedBsConfig>(result.stdout);
      if (!config) {
        return {
          content: [
            {
              type: "text",
              text:
                "Script succeeded but no JSON config could be parsed from its output:\n" +
                truncate(result.stdout, 4000),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
        structuredContent: { ...config },
      };
    }
  );

  server.registerTool(
    "pek_get_browserstack_build_link",
    {
      title: "Get BrowserStack build link",
      description: `Finds the BrowserStack Automate dashboard URL for a build by name (exact > startsWith > contains match, falling back to the most recent build). Wraps scripts/get-browserstack-build-link.js.

Args:
  - buildName (string): the build name to look up (as set in browserstack.config / CI)

Returns: { buildUrl }

Requires BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY.`,
      inputSchema: {
        buildName: z.string().min(1).describe("BrowserStack build name to search for"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ buildName }) => {
      const result = await runCommand("node", ["scripts/get-browserstack-build-link.js"], {
        timeoutMs: 30_000,
        env: { ...process.env, BROWSERSTACK_BUILD_NAME: buildName },
      });

      const combined = result.stdout + "\n" + result.stderr;
      const match = combined.match(/BrowserStack build URL:\s*(\S+)/);

      if (result.exitCode !== 0 || !match) {
        return {
          content: [
            {
              type: "text",
              text:
                `Could not resolve a build URL for '${buildName}':\n` +
                truncate(combined, 4000) +
                "\nCheck BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY and the build name.",
            },
          ],
          isError: true,
        };
      }

      const output = { buildUrl: match[1] };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
