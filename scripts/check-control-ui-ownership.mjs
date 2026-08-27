import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Validates that all Control UI components in apps/web/src/control/components/
 * compose owned UI atoms and organisms instead of using raw un-governed HTML elements.
 *
 * Enforces OpenSpec change 0153 (Complete Atomic Component Coverage).
 */

const ALLOWED_BUTTON_FILES = new Set([
  'JerseyGrid.tsx',
  'CountrySelect.tsx',
  'ToastProvider.tsx',
  'StandingsPage.tsx',
]);

const ALLOWED_INPUT_FILES = new Set(['JerseyGrid.tsx']);

/**
 * Checks a file's content for violations of UI ownership.
 *
 * @param {string} filename - Base name or relative path of the file
 * @param {string} content - Source code content of the file
 * @returns {readonly { line: number, message: string }[]} List of violations found
 */
export function checkFileOwnership(filename, content) {
  const violations = [];
  const lines = content.split('\n');
  const baseName = filename.split('/').pop() ?? filename;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Ignore comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // 1. Raw <dialog> is prohibited (use Modal organism)
    if (/<dialog[\s>]/.test(line)) {
      violations.push({
        line: lineNum,
        message: 'Raw <dialog> detected. Use the owned `Modal` organism instead.',
      });
    }

    // 2. Raw <table> is prohibited (use DataTable organism)
    if (/<table[\s>]/.test(line)) {
      violations.push({
        line: lineNum,
        message: 'Raw <table> detected. Use the owned `DataTable` organism instead.',
      });
    }

    // 3. Raw <textarea> is prohibited (use Textarea atom)
    if (/<textarea[\s>]/.test(line)) {
      violations.push({
        line: lineNum,
        message: 'Raw <textarea> detected. Use the owned `Textarea` atom instead.',
      });
    }

    // 4. Raw <button> checks
    if (/<button[\s>]/.test(line)) {
      if (!ALLOWED_BUTTON_FILES.has(baseName)) {
        violations.push({
          line: lineNum,
          message: `Raw <button> detected in ${baseName}. Use the owned \`Button\` atom instead.`,
        });
      }
    }

    // 5. Raw <input> checks
    if (/<input[\s>]/.test(line)) {
      if (!ALLOWED_INPUT_FILES.has(baseName)) {
        // Collect full element tag if multiline
        let elementText = line;
        let j = i;
        while (!elementText.includes('>') && j + 1 < lines.length && j - i < 10) {
          j++;
          elementText += ' ' + lines[j];
        }

        const isCheckbox = /type=["']checkbox["']/.test(elementText);
        const isRadio = /type=["']radio["']/.test(elementText);
        const isFile = /type=["']file["']/.test(elementText);

        if (!isCheckbox && !isRadio && !isFile) {
          violations.push({
            line: lineNum,
            message: `Raw <input> detected in ${baseName}. Use the owned \`Input\` atom instead.`,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Scans a directory recursively for Control components and returns all violations.
 *
 * @param {string} dirPath - Absolute path to control components directory
 * @returns {Record<string, readonly { line: number, message: string }[]>}
 */
export function scanControlComponents(dirPath) {
  const results = {};

  function scan(current) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip the owned ui/ primitives directory
        if (entry === 'ui') continue;
        scan(fullPath);
      } else if (
        (entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
        !entry.endsWith('.test.tsx') &&
        !entry.endsWith('.test.ts')
      ) {
        const content = readFileSync(fullPath, 'utf8');
        const relPath = relative(dirPath, fullPath);
        const fileViolations = checkFileOwnership(entry, content);
        if (fileViolations.length > 0) {
          results[relPath] = fileViolations;
        }
      }
    }
  }

  scan(dirPath);
  return results;
}

// CLI runner when executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const componentsDir = join(
    fileURLToPath(import.meta.url),
    '../../apps/web/src/control/components',
  );

  const violationsMap = scanControlComponents(componentsDir);
  const fileCount = Object.keys(violationsMap).length;

  if (fileCount > 0) {
    console.error(
      `\x1b[31m[FAIL]\x1b[0m Found Control UI ownership violations in ${fileCount} file(s):`,
    );
    for (const [file, violations] of Object.entries(violationsMap)) {
      console.error(`\n  \x1b[1m${file}\x1b[0m:`);
      for (const v of violations) {
        console.error(`    Line ${v.line}: ${v.message}`);
      }
    }
    process.exit(1);
  } else {
    console.log('\x1b[32m[PASS]\x1b[0m All Control UI components comply with atomic ownership.');
    process.exit(0);
  }
}
