import { parseArgs } from 'node:util';

export interface CreateAdminRequest {
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly email: string;
}

export interface CreateAdminResult {
  readonly setupUrl: string;
}

export function parseCreateAdminArguments(arguments_: readonly string[]): CreateAdminRequest {
  const parsed = parseArgs({
    args: [...arguments_],
    options: {
      'organization-alias': { type: 'string' },
      'organization-name': { type: 'string' },
      email: { type: 'string' },
    },
    strict: true,
  });
  const organizationAlias = required(parsed.values['organization-alias'], '--organization-alias');
  const organizationName = required(parsed.values['organization-name'], '--organization-name');
  const email = required(parsed.values.email, '--email');
  return { organizationAlias, organizationName, email };
}

export async function createInitialAdministrator(
  request: CreateAdminRequest,
  environment: NodeJS.ProcessEnv = process.env,
  requestFetch: typeof fetch = fetch,
): Promise<CreateAdminResult> {
  const apiUrl = required(environment.COPALIBRE_API_URL, 'COPALIBRE_API_URL');
  const bootstrapToken = required(
    environment.COPALIBRE_BOOTSTRAP_TOKEN,
    'COPALIBRE_BOOTSTRAP_TOKEN',
  );
  const target = new URL('/installation/bootstrap/admin', apiUrl);
  const response = await requestFetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-copalibre-bootstrap-token': bootstrapToken,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => undefined)) as
    { readonly setupUrl?: unknown; readonly message?: unknown } | undefined;
  if (!response.ok) {
    throw new Error(
      `installation bootstrap returned HTTP ${response.status}${messageSuffix(body?.message)}`,
    );
  }
  if (typeof body?.setupUrl !== 'string') {
    throw new Error('installation bootstrap did not return a setup URL');
  }
  return { setupUrl: body.setupUrl };
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function messageSuffix(message: unknown): string {
  return typeof message === 'string' ? `: ${message}` : '';
}
