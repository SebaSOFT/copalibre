import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Reads the rendered heading outline of the page and returns what breaks it: not
 * exactly one `h1`, an outline that does not open with it, a heading with no name,
 * and a level skipped on the way down. Axe's `heading-order` rule runs as well.
 * Call it once the page shows its content, or it reads the loading state.
 */
export async function headingOutlineFailures(page: Page, routeName: string): Promise<string[]> {
  const failures: string[] = [];
  try {
    await expect(page.locator('h1')).toHaveCount(1, { timeout: 5_000 });
  } catch {
    failures.push(
      `${routeName}: expected exactly one h1, found ${await page.locator('h1').count()}`,
    );
  }

  const headings = await page
    .locator('h1,h2,h3,h4,h5,h6,[role="heading"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const level = element.matches('h1,h2,h3,h4,h5,h6')
          ? Number(element.tagName.slice(1))
          : Number(element.getAttribute('aria-level'));
        const labelledBy = element
          .getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
          .join(' ');
        const name =
          element.textContent?.trim() ||
          element.getAttribute('aria-label')?.trim() ||
          labelledBy ||
          '';
        return { level, name };
      }),
    );

  if (headings.filter(({ level }) => level === 1).length !== 1) {
    failures.push(`${routeName}: rendered outline must contain one level-one heading`);
  }
  if (headings[0]?.level !== 1) {
    failures.push(`${routeName}: the page heading must lead the outline`);
  }
  headings.forEach(({ level, name }, index) => {
    if (!Number.isInteger(level) || level < 1 || level > 6) {
      failures.push(`${routeName}: heading ${index + 1} has invalid level ${level}`);
    }
    if (!name.trim()) failures.push(`${routeName}: heading ${index + 1} is empty`);
    const previous = headings[index - 1];
    if (previous && level > previous.level + 1) {
      failures.push(`${routeName}: skipped heading level h${previous.level} → h${level}`);
    }
  });

  const { violations } = await new AxeBuilder({ page }).withRules(['heading-order']).analyze();
  for (const violation of violations) {
    failures.push(
      `${routeName}: axe ${violation.id}: ${violation.nodes.map(({ target }) => target).join(', ')}`,
    );
  }
  return failures;
}

/** Fails with every outline problem on the page, each one naming the route. */
export async function expectCompleteHeadingOutline(page: Page, routeName: string): Promise<void> {
  expect(await headingOutlineFailures(page, routeName)).toEqual([]);
}
