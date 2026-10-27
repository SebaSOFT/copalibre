import { expect, test } from '@playwright/test';
import {
  formatVisibleIdentifierViolations,
  scanVisibleIdentifiers,
} from '../scripts/check-visible-identifiers.mjs';

test('the rendered identifier lint reports route and element while ignoring hidden content @visible-identifier-lint', async ({
  page,
}) => {
  await page.goto('/control/login');
  await page.setContent(`
    <main>
      <p>Record 018f06f4-3d70-7000-8000-000000000001</p>
      <p>Match WB-R1-M1</p>
      <div class="cl-entrant-name">Deportivo 9FF7AE5A</div>
      <p>liga-mendocina</p>
      <p hidden>invisible 018f06f4-3d70-7000-8000-000000000002</p>
      <script>const fixture = 'liga-mendocina';</script>
    </main>
  `);

  const violations = await page.evaluate(scanVisibleIdentifiers, ['liga-mendocina']);
  expect(violations).toHaveLength(4);
  const report = formatVisibleIdentifierViolations(violations);
  expect(report).toContain('/control/login');
  expect(report).toContain('p: uuid');
  expect(report).toContain('p: internal match code');
  expect(report).toContain('.cl-entrant-name: 8-character identifier in a name slot');
  expect(report).toContain('p: known alias "liga-mendocina"');
});
