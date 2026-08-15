import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { readCredential, writeCredential, type StoredCredential } from './credentials.js';

export interface LoginOptions {
  readonly apiUrl: string;
  readonly token?: string;
}

/**
 * `--api-url`, else `COPALIBRE_API_URL` — which `copalibre init`
 * already writes into `.env`, loaded by the `./copalibre` wrapper script
 * before this process starts, so a directory `init`'d covers this without
 * `login` itself needing to read the installation marker (the marker
 * carries no API URL to read — only version/install-id/mode/timestamp).
 */
export function parseLoginArguments(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): LoginOptions {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      'api-url': { type: 'string' },
      token: { type: 'string' },
    },
    strict: true,
  });
  const apiUrl = parsed.values['api-url'] ?? environment.COPALIBRE_API_URL;
  if (!apiUrl?.trim()) {
    throw new Error(
      '--api-url is required (or set COPALIBRE_API_URL, which "copalibre init" already writes to .env)',
    );
  }
  return {
    apiUrl,
    ...(parsed.values.token === undefined ? {} : { token: parsed.values.token }),
  };
}

async function readAllStdin(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Masks input the same way `ssh-keygen`/`sudo` do: echoes an asterisk per
 * keystroke via `readline`'s `_writeToOutput` hook, rather than disabling
 * echo entirely (which would give the operator no feedback that keys are
 * being received at all).
 */
async function promptMasked(prompt: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const output = readline as unknown as { _writeToOutput?: (value: string) => void };
  let masking = false;
  const original = output._writeToOutput?.bind(output);
  output._writeToOutput = (value: string) => {
    if (!masking || !original) return;
    if (value === '\r\n' || value === '\n') {
      original(value);
      return;
    }
    original('*'.repeat(value.length));
  };
  process.stdout.write(prompt);
  masking = true;
  try {
    return await readline.question('');
  } finally {
    masking = false;
    readline.close();
  }
}

async function defaultReadToken(): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await readAllStdin(process.stdin)).trim();
  }
  return (await promptMasked('Personal access token: ')).trim();
}

export interface LoginDependencies {
  readonly fetch?: typeof fetch;
  readonly readToken?: () => Promise<string>;
}

/**
 * `copalibre login` stores a personal access token generated from an
 * already-authenticated control-panel session, validated with one
 * lightweight authenticated call (`GET /organizations?mine=true` —
 * `RequireSelf()`, the smallest existing route that only needs a verified
 * subject, no organization or super-admin authority) before storing anything.
 * Writes into `cwd`'s `.copalibre/credentials.json` (`credentials.ts`) —
 * real callers always pass `process.cwd()`; tests pass a temp directory.
 */
export async function login(
  cwd: string,
  options: LoginOptions,
  dependencies: LoginDependencies = {},
): Promise<StoredCredential> {
  const requestFetch = dependencies.fetch ?? fetch;
  const readToken = dependencies.readToken ?? defaultReadToken;
  const token = options.token ?? (await readToken());
  if (!token) throw new Error('No token provided');

  const target = new URL('/organizations?mine=true', options.apiUrl);
  const response = await requestFetch(target, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `Token rejected by ${options.apiUrl} (HTTP ${response.status}) — generate a new personal ` +
        "access token from the control panel's preferences screen and try again",
    );
  }

  return writeCredential(cwd, options.apiUrl, token);
}

export { readCredential };
