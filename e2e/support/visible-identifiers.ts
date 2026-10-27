import { expect, type Page } from '@playwright/test';
import {
  formatVisibleIdentifierViolations,
  scanVisibleIdentifiers,
} from '../../scripts/check-visible-identifiers.mjs';

export const FIXTURE_ALIASES = ['liga-mendocina', 'apertura-2026'] as const;

export async function expectNoVisibleIdentifiers(
  page: Page,
  knownAliases: readonly string[] = [],
): Promise<void> {
  const violations = await page.evaluate(scanVisibleIdentifiers, [...knownAliases]);
  expect(violations, formatVisibleIdentifierViolations(violations)).toEqual([]);
}
