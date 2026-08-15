import { validateModulePackage } from '@copalibre/module-distribution';

export interface ValidateLocalResult {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/**
 * Runs the exact validation `module add`/`module verify` already apply
 * (`validateModulePackage`) directly against a local directory — no fetch,
 * no install.
 */
export async function validateLocalModule(
  path: string,
  runningCopalibreVersion: string,
): Promise<ValidateLocalResult> {
  const result = await validateModulePackage(path, { runningCopalibreVersion });
  if (result.ok) {
    return {
      ok: true,
      lines: [`PASS ${result.value.manifest.alias}@${result.value.manifest.version}`],
    };
  }
  return {
    ok: false,
    lines: [
      `FAIL ${path}`,
      ...result.failures.map((failure) => `  [${failure.stage}] ${failure.message}`),
    ],
  };
}
