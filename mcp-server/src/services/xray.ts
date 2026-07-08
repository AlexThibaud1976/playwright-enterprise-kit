import fs from "node:fs";
import path from "node:path";
import { DEFAULT_XRAY_ENDPOINT, PEK_ROOT } from "../constants.js";

/**
 * TypeScript port of scripts/upload-xray.ps1 so the MCP server stays
 * cross-platform (no PowerShell dependency). Same flow:
 *   1. authenticate with XRAY_CLIENT_ID / XRAY_CLIENT_SECRET
 *   2. POST the JUnit XML to /api/v2/import/execution/junit
 *   3. return the created Test Execution key
 */

export interface XrayUploadResult {
  execKey: string;
  reportPath: string;
  importUrl: string;
}

async function authenticate(endpoint: string): Promise<string> {
  const clientId = process.env.XRAY_CLIENT_ID;
  const clientSecret = process.env.XRAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "XRAY_CLIENT_ID and/or XRAY_CLIENT_SECRET are not set. " +
        "Export them (or add them to your MCP client config 'env') before calling this tool."
    );
  }

  const response = await fetch(`https://${endpoint}/api/v2/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Xray authentication failed (${response.status} ${response.statusText}): ${body}. ` +
        "Check XRAY_CLIENT_ID / XRAY_CLIENT_SECRET."
    );
  }

  // The endpoint returns the JWT as a JSON string ("ey...")
  const raw = (await response.text()).trim();
  return raw.replace(/^"|"$/g, "");
}

export async function uploadJUnitToXray(params: {
  reportPath: string;
  testPlanKey: string;
  projectKey: string;
  endpoint?: string;
}): Promise<XrayUploadResult> {
  const endpoint = params.endpoint || process.env.XRAY_ENDPOINT || DEFAULT_XRAY_ENDPOINT;

  const resolvedPath = path.isAbsolute(params.reportPath)
    ? params.reportPath
    : path.join(PEK_ROOT, params.reportPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `JUnit report not found: ${resolvedPath}. ` +
        "Run the tests first (pek_run_tests) and make sure " +
        "@xray-app/playwright-junit-reporter is configured in playwright.config."
    );
  }

  const junitContent = fs.readFileSync(resolvedPath, "utf8");
  if (junitContent.trim().length === 0) {
    throw new Error(`JUnit report is empty: ${resolvedPath}`);
  }

  const token = await authenticate(endpoint);

  const importUrl =
    `https://${endpoint}/api/v2/import/execution/junit` +
    `?projectKey=${encodeURIComponent(params.projectKey)}` +
    `&testPlanKey=${encodeURIComponent(params.testPlanKey)}`;

  const response = await fetch(importUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      Authorization: `Bearer ${token}`,
    },
    body: junitContent,
    signal: AbortSignal.timeout(60_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Xray import failed (${response.status} ${response.statusText}): ${body}. ` +
        `Check that project '${params.projectKey}' and Test Plan '${params.testPlanKey}' exist ` +
        "and that the Xray client has import permissions."
    );
  }

  let execKey = "";
  try {
    const parsed = JSON.parse(body) as { key?: string };
    execKey = parsed.key ?? "";
  } catch {
    const match = body.match(/"key"\s*:\s*"([^"]+)"/);
    execKey = match?.[1] ?? "";
  }

  if (!execKey) {
    throw new Error(`Xray import succeeded but no Test Execution key was returned. Raw response: ${body}`);
  }

  return { execKey, reportPath: resolvedPath, importUrl };
}
