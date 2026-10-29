import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TREE_LOCALES = [
  {
    heading: 'English',
    label: 'English',
    taskHeading: 'Task',
  },
  { heading: 'Español', label: 'Español', taskHeading: 'Tarea' },
];
const EXPECTED_DESTINATION_COUNT = 10;

/**
 * Build every valid route in one locale's nested navigation tree.
 * @param {string} markdown
 * @param {string} heading Locale heading, without Markdown hashes.
 */
export function parseTreePaths(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    return { paths: new Set(), errors: [`Missing tree section: ${heading}`] };
  }

  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    section.push(lines[index]);
  }

  const paths = new Set();
  const stack = [];
  const errors = [];

  for (let index = 0; index < section.length; index += 1) {
    const line = section[index];
    if (line.trim() === '') continue;

    const bullet = /^( *)- (.+?)\s*$/.exec(line);
    if (!bullet) {
      errors.push(`${heading}: expected a nested bullet at line ${start + index + 2}`);
      continue;
    }

    const indentation = bullet[1].length;
    const depth = indentation / 2;
    if (indentation % 2 !== 0) {
      errors.push(
        `${heading}: indentation must use two spaces per level at line ${start + index + 2}`,
      );
      continue;
    }
    if (depth > stack.length) {
      errors.push(`${heading}: route skips a parent level at line ${start + index + 2}`);
      continue;
    }

    stack.length = depth;
    const label = bullet[2].trim();
    if (label.length === 0) {
      errors.push(`${heading}: route label is empty at line ${start + index + 2}`);
      continue;
    }

    const route = [...stack, label];
    paths.add(JSON.stringify(route));
    stack[depth] = label;
  }

  return { paths, errors };
}

/**
 * @param {string} tasksMarkdown
 * @param {string} locale
 */
export function parseExpectedDestinations(tasksMarkdown, locale) {
  const expectedLabel = locale === 'English' ? 'Expected destination' : 'Destino esperado';
  const expression = new RegExp('^- ' + expectedLabel + ' \\(' + locale + '\\): `([^`]+)`$', 'gm');
  return [...tasksMarkdown.matchAll(expression)].map((match) => match[1]);
}

function parseTaskSections(tasksMarkdown, locale) {
  const lines = tasksMarkdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${locale.heading}`);
  if (start === -1) return [];

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const taskHeading = new RegExp(`^### ${locale.taskHeading} (\\d+) — (.+)$`);
  const sectionLines = lines.slice(start + 1, end);
  const starts = [];
  for (let index = 0; index < sectionLines.length; index += 1) {
    const match = taskHeading.exec(sectionLines[index]);
    if (match) starts.push({ index, number: match[1], title: match[2] });
  }

  return starts.map((task, index) => {
    const next = starts[index + 1]?.index ?? sectionLines.length;
    return {
      number: task.number,
      title: task.title,
      markdown: sectionLines.slice(task.index + 1, next).join('\n'),
    };
  });
}

/**
 * Confirm that each moderator-only destination exists as a parent-to-child path.
 * @param {string} treeMarkdown
 * @param {string} tasksMarkdown
 */
export function validateResearchKit(treeMarkdown, tasksMarkdown) {
  const errors = [];

  for (const locale of TREE_LOCALES) {
    const { paths, errors: treeErrors } = parseTreePaths(treeMarkdown, locale.heading);
    errors.push(...treeErrors);

    const tasks = parseTaskSections(tasksMarkdown, locale);
    if (tasks.length !== EXPECTED_DESTINATION_COUNT) {
      errors.push(
        `${locale.label}: expected ${EXPECTED_DESTINATION_COUNT} tree-test tasks, found ${tasks.length}`,
      );
    }

    for (const task of tasks) {
      const destinations = parseExpectedDestinations(task.markdown, locale.label);
      if (destinations.length !== 1) {
        errors.push(
          `${locale.label}: task ${task.number} — ${task.title} must name exactly one expected destination, found ${destinations.length}`,
        );
        continue;
      }

      const [destination] = destinations;
      const segments = destination.split('>').map((segment) => segment.trim());
      if (segments.some((segment) => segment.length === 0)) {
        errors.push(`${locale.label}: destination contains an empty route segment: ${destination}`);
        continue;
      }
      if (!paths.has(JSON.stringify(segments))) {
        errors.push(
          `${locale.label}: destination is not present in the navigation tree: ${destination}`,
        );
      }
    }
  }

  return errors;
}

async function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const treeMarkdown = readFileSync(
    join(repoRoot, 'docs/research/2026-operator-study/tree.md'),
    'utf8',
  );
  const tasksMarkdown = readFileSync(
    join(repoRoot, 'docs/research/2026-operator-study/tree-tasks.md'),
    'utf8',
  );
  const errors = validateResearchKit(treeMarkdown, tasksMarkdown);

  if (errors.length > 0) {
    process.stderr.write(
      `Operator research kit validation failed:\n${errors.map((error) => `  - ${error}\n`).join('')}`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write('Operator research kit: tree-test destinations match both locale trees.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
