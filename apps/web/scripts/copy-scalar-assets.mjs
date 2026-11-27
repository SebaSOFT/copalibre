import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vendors the API reference's renderer into the static build, so a self-hosted installation with no
// internet egress renders it fully offline: the pinned package's own standalone bundle, and the
// configuration that goes with it (see src/help/api-reference-init.js).

/** The host the bundle's theme CSS loads its fonts from, which an installation must never call. */
const HOSTED_FONTS = 'fonts.scalar.com';

/**
 * The bundle with its hosted `@font-face` rules removed. `withDefaultFonts: false` stops only one of
 * the two places the theme CSS is built, so the other still asks the host for fourteen font files
 * (the content security policy blocks them, and every one is a console error and a call out). The
 * page falls back to the system fonts its configuration names. Fails if anything still names the
 * host, so a Scalar upgrade that moves the rules breaks the build instead of reintroducing the call.
 */
export function withoutHostedFonts(source) {
  const stripped = source.replace(
    new RegExp(`@font-face\\s*\\{[^{}]*${HOSTED_FONTS.replaceAll('.', '\\.')}[^{}]*\\}`, 'g'),
    '',
  );
  if (stripped.includes(HOSTED_FONTS)) {
    throw new Error(
      `The Scalar bundle still names ${HOSTED_FONTS} after its font rules were removed`,
    );
  }
  return stripped;
}

/** The probe the bundle's validation library runs to learn whether it may compile validators. */
const EVAL_PROBE = 'try{return Function(``),!0}catch{return!1}';

/**
 * The bundle without its code-generation probe. The validation library tests whether `Function('')`
 * works and, when the policy forbids it, falls back to interpreting validators: the answer is the
 * same, but the attempt is a Content Security Policy violation on every load. The policy has no
 * `unsafe-eval` and must not gain one for this page, so the probe answers "no" without asking. Fails
 * when the probe is not there exactly once, so an upgrade is looked at rather than assumed.
 */
export function withoutEvalProbe(source) {
  const parts = source.split(EVAL_PROBE);
  if (parts.length !== 2) {
    throw new Error(
      `Expected the Scalar bundle's eval probe exactly once, found ${parts.length - 1}`,
    );
  }
  return parts.join('return!1');
}

function main() {
  const root = dirname(fileURLToPath(import.meta.url));
  const destination = join(root, '../public/vendor/scalar');
  const bundle = join(
    root,
    '../../../node_modules/@scalar/api-reference/dist/browser/standalone.js',
  );
  const init = join(root, '../src/help/api-reference-init.js');

  for (const source of [bundle, init]) {
    if (!existsSync(source)) {
      process.stderr.write(`API reference asset is missing: ${source}\n`);
      process.exit(1);
    }
  }

  mkdirSync(destination, { recursive: true });
  writeFileSync(
    join(destination, 'standalone.js'),
    withoutEvalProbe(withoutHostedFonts(readFileSync(bundle, 'utf8'))),
  );
  copyFileSync(init, join(destination, 'init.js'));
  process.stdout.write(
    `Copied the API reference's Scalar bundle, without its hosted fonts or its eval probe, and configuration to ${destination}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
