export interface ApiClientConfig {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetchImplementation?: typeof fetch;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface ProblemBody {
  readonly message?: string;
}

/**
 * Minimal fetch wrapper for the five tournament-operational MCP tools (0047) —
 * ~30 lines is well within this project's "trivial one-liners are fine to
 * hand-roll" carve-out; a generated OpenAPI client is a larger investment
 * five endpoints don't justify (design.md).
 */
async function request(
  config: ApiClientConfig,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<unknown> {
  const doFetch = config.fetchImplementation ?? fetch;
  const response = await doFetch(new URL(path, config.baseUrl), {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message =
      (parsed as ProblemBody | undefined)?.message ?? response.statusText ?? 'Request failed';
    throw new ApiRequestError(response.status, message);
  }
  return parsed;
}

export function apiGet(config: ApiClientConfig, path: string): Promise<unknown> {
  return request(config, 'GET', path);
}

export function apiPost(config: ApiClientConfig, path: string, body?: unknown): Promise<unknown> {
  return request(config, 'POST', path, body);
}
