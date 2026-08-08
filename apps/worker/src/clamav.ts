import NodeClam from 'clamscan';

/**
 * `bypassTest: true` (task 2.3): connectivity is checked lazily, on the
 * first real scan, not here — an installation where `clamd` is briefly
 * unreachable at worker startup should still start; the scan job itself
 * fails and retries through the existing outbox backoff/dead-letter path
 * (relay-runner.ts), the same as any other handler error.
 */
export async function createClamScanClient(
  env: NodeJS.ProcessEnv = process.env,
): Promise<NodeClam> {
  return new NodeClam().init({
    clamdscan: {
      host: env.COPALIBRE_CLAMD_HOST ?? 'clamd',
      port: Number(env.COPALIBRE_CLAMD_PORT ?? 3310),
      bypassTest: true,
    },
    preference: 'clamdscan',
  });
}
