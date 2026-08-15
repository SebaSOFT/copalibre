export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Every command's `execute()` body runs through this: an uncaught error
 * becomes a concise operator-facing line on stderr and exit code 1, named
 * after the top-level command (`name`).
 */
export async function runCommand(name: string, body: () => Promise<number>): Promise<number> {
  try {
    return await body();
  } catch (error) {
    process.stderr.write(`copalibre ${name} failed: ${errorMessage(error)}\n`);
    return 1;
  }
}
