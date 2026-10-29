import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTreePaths, validateResearchKit } from './check-research-kit.mjs';

const englishTree = `## English

- Organization
  - Dashboard
    - TV devices
  - Tournaments
    - Panamericano
      - Schedule
      - Officials
  - Audit trail
`;

const spanishTree = `## Español

- Organización
  - Tablero
    - Dispositivos de TV
  - Torneos
    - Panamericano
      - Calendario
      - Árbitros
  - Registro de auditoría
`;

function taskLines(locale, routes) {
  const label = locale === 'English' ? 'Expected destination' : 'Destino esperado';
  const taskLabel = locale === 'English' ? 'Task' : 'Tarea';
  return routes
    .map(
      (route, index) =>
        `### ${taskLabel} ${index + 1} — Test task ${index + 1}\n\n- ${label} (${locale}): \`${route}\`\n\n`,
    )
    .join('');
}

const englishDestinations = [
  'Organization > Dashboard > TV devices',
  'Organization > Tournaments > Panamericano > Schedule',
  'Organization > Tournaments > Panamericano > Officials',
  'Organization > Audit trail',
  'Organization > Dashboard',
  'Organization > Tournaments',
  'Organization > Tournaments > Panamericano',
  'Organization',
  'Organization > Dashboard > TV devices',
  'Organization > Audit trail',
];

const spanishDestinations = [
  'Organización > Tablero > Dispositivos de TV',
  'Organización > Torneos > Panamericano > Calendario',
  'Organización > Torneos > Panamericano > Árbitros',
  'Organización > Registro de auditoría',
  'Organización > Tablero',
  'Organización > Torneos',
  'Organización > Torneos > Panamericano',
  'Organización',
  'Organización > Tablero > Dispositivos de TV',
  'Organización > Registro de auditoría',
];

const validTasks =
  `## English\n${taskLines('English', englishDestinations)}\n## Español\n` +
  taskLines('Español', spanishDestinations);

test('parses each navigation node as a complete parent-to-child path', () => {
  const parsed = parseTreePaths(englishTree, 'English');

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.paths.has(JSON.stringify(['Organization', 'Dashboard', 'TV devices'])), true);
  assert.equal(parsed.paths.has(JSON.stringify(['Organization', 'TV devices'])), false);
});

test('accepts ten expected destinations that exist in both locale trees', () => {
  assert.deepEqual(validateResearchKit(`${englishTree}\n${spanishTree}`, validTasks), []);
});

test('reports expected destinations missing from either locale tree', () => {
  const tasks = validTasks.replace(
    'Organization > Tournaments > Panamericano > Schedule',
    'Organization > Tournaments > Panamericano > Venues',
  );

  assert.deepEqual(validateResearchKit(`${englishTree}\n${spanishTree}`, tasks), [
    'English: destination is not present in the navigation tree: Organization > Tournaments > Panamericano > Venues',
  ]);
});

test('rejects skipped parent levels and non-two-space indentation', () => {
  const parsed = parseTreePaths(
    '## English\n- Organization\n    - Orphan\n   - Misaligned\n',
    'English',
  );

  assert.deepEqual(parsed.errors, [
    'English: route skips a parent level at line 3',
    'English: indentation must use two spaces per level at line 4',
  ]);
});

test('requires the documented ten destinations for every locale', () => {
  const shortTasks = `## English\n${taskLines('English', ['Organization > Dashboard'])}\n## Español\n${taskLines('Español', ['Organización > Tablero'])}`;
  const errors = validateResearchKit(`${englishTree}\n${spanishTree}`, shortTasks);

  assert.equal(
    errors.some((error) => error.startsWith('English: expected 10 tree-test tasks, found 1')),
    true,
  );
  assert.equal(
    errors.some((error) => error.startsWith('Español: expected 10 tree-test tasks, found 1')),
    true,
  );
});

test('requires every tree-test task to declare one moderator destination', () => {
  const tasks = validTasks.replace(
    '- Expected destination (English): `Organization > Dashboard > TV devices`',
    '- Participant destination: `Organization > Dashboard > TV devices`',
  );
  const errors = validateResearchKit(`${englishTree}\n${spanishTree}`, tasks);

  assert.equal(
    errors.includes(
      'English: task 1 — Test task 1 must name exactly one expected destination, found 0',
    ),
    true,
  );
});

test('reports a missing locale section', () => {
  const errors = validateResearchKit(englishTree, validTasks);

  assert.equal(errors.includes('Missing tree section: Español'), true);
});
