/**
 * Minimal HTTP helpers shared by the integrations (Node >= 22, global fetch).
 *
 * Every call has a timeout and turns non-2xx answers into errors whose message
 * includes the status and the start of the body, so a misconfiguration surfaces
 * as an actionable log line instead of an opaque stack trace.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

function basicAuth(user, secret) {
  return 'Basic ' + Buffer.from(`${user}:${secret}`).toString('base64');
}

/**
 * @param {string} url
 * @param {{method?: string, headers?: Record<string,string>, body?: any, json?: any,
 *          timeoutMs?: number, fetch?: typeof fetch}} [options]
 * @returns {Promise<any>} parsed JSON when possible, raw text otherwise
 */
async function request(url, options = {}) {
  const { method = 'GET', headers = {}, json, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const doFetch = options.fetch || globalThis.fetch;
  let body = options.body;
  const finalHeaders = { Accept: 'application/json', ...headers };

  if (json !== undefined) {
    body = JSON.stringify(json);
    finalHeaders['Content-Type'] = 'application/json';
  }

  const response = await doFetch(url, {
    method,
    headers: finalHeaders,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${redact(url)} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Hides query-string secrets (tokens in webhook URLs, ws endpoints...) in logs. */
function redact(url) {
  try {
    const u = new URL(url);
    if (u.search) u.search = '?…';
    // Slack/Teams webhook paths are secrets in themselves
    if (/hooks\.slack\.com|webhook\.office\.com|logic\.azure\.com|powerautomate/i.test(u.host)) {
      u.pathname = '/…';
    }
    return u.toString();
  } catch {
    return '<invalid url>';
  }
}

module.exports = { request, basicAuth, redact, DEFAULT_TIMEOUT_MS };
