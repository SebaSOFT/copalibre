import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Astro's Content Security Policy hashes the scripts it processes, but not the
 * `is:inline` ones Starlight renders on help pages (theme picker, sidebar
 * state, search shortcut). Help is prerendered, so after the build every
 * inline script of a static page is known: this adds each one's hash to that
 * page's own `<meta>` policy. It only trusts what the build itself emitted.
 * On-demand pages are not touched; their inline scripts must be hashed by
 * Astro or moved to a file.
 */

const POLICY_META = /<meta http-equiv="content-security-policy" content="([^"]*)"/;
const INLINE_SCRIPT = /<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g;

function isExecutable(attributes) {
  if (/\ssrc=/.test(attributes)) return false;
  const type = attributes.match(/\stype="([^"]*)"/)?.[1];
  return type === undefined || type === 'module' || /^(text|application)\/javascript$/.test(type);
}

export function addInlineScriptHashes(html) {
  const meta = html.match(POLICY_META);
  if (!meta) return html;
  const policy = meta[1];
  const missing = new Set();
  for (const [, attributes, body] of html.matchAll(INLINE_SCRIPT)) {
    if (!isExecutable(attributes)) continue;
    const source = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!policy.includes(source)) missing.add(source);
  }
  if (missing.size === 0) return html;
  const updated = policy.replace(
    /script-src ([^;]*)/,
    (directive) => `${directive} ${[...missing].join(' ')}`,
  );
  return html.replace(meta[0], meta[0].replace(policy, updated));
}

async function* htmlFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

export default function cspStaticInlineHashes() {
  return {
    name: 'copalibre-csp-static-inline-hashes',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        let updated = 0;
        for await (const file of htmlFiles(fileURLToPath(dir))) {
          const html = await readFile(file, 'utf8');
          const next = addInlineScriptHashes(html);
          if (next !== html) {
            await writeFile(file, next, 'utf8');
            updated += 1;
          }
        }
        logger.info(`added inline script hashes to ${updated} static pages`);
      },
    },
  };
}
