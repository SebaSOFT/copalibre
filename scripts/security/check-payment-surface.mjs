import { execFileSync } from 'node:child_process';

/**
 * Guards the "prices and payments: not applicable" classification.
 *
 * CopaLibre has no pricing, checkout or payment flow. If one appears in the
 * application code, the API contract or the dependency list, this exits 1 so
 * the security control stops counting as not applicable and the flow has to
 * be reviewed for server-authoritative amounts and verified payment events.
 */

const PATTERN = String.raw`\bstripe\b|mercado ?pago|\bpaypal\b|checkout[_ -]?session|\bpayments?\b|\binvoices?\b|\bbilling\b|\bprice[_ -]?id\b|\bcurrency\b|\bpaid[_ -]?status\b`;
const PATHS = [
  'apps',
  'packages',
  'package.json',
  ':!**/*.test.*',
  ':!**/dist/**',
  ':!**/test-fixtures/**',
];

export function paymentMatches(cwd) {
  try {
    const output = execFileSync('git', ['grep', '-nIiE', PATTERN, '--', ...PATHS], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split('\n').filter((line) => line.length > 0);
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if (error.status === 1) return [];
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const matches = paymentMatches(new URL('../..', import.meta.url).pathname);
  if (matches.length > 0) {
    process.stderr.write('Payment-related code found; review the prices and payments control:\n');
    for (const match of matches.slice(0, 50)) process.stderr.write(`  ${match.slice(0, 200)}\n`);
    process.exit(1);
  }
  process.stdout.write('No pricing or payment surface in application code or contracts.\n');
}
