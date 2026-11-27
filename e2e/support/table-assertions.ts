import { expect, type Page } from '@playwright/test';

/**
 * Assertions shared by the specs that check how a data table behaves on a narrow screen: a
 * table that stacks or prioritises its columns needs no sideways scroll, and no name or header
 * inside one breaks in the middle of a word.
 */

/** Every table that declared the given mode fits inside its own frame. */
export async function expectTablesFitTheirFrame(
  page: Page,
  mode: 'stacked' | 'priority',
): Promise<void> {
  const overflowing = await page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((frame) => frame.scrollWidth > frame.clientWidth + 1)
      .map((frame) => ({
        label: frame.getAttribute('aria-label') ?? frame.textContent?.trim().slice(0, 40) ?? '',
        by: frame.scrollWidth - frame.clientWidth,
      }));
  }, `.cl-data-table--${mode}`);
  expect(overflowing).toEqual([]);
}

/**
 * No visible table text wraps so that a line holds fewer than three characters of a longer
 * word — the "Lomas / de Riv / adavia" breaks the audit found. Checks every cell and column
 * header of the tables inside `scope`.
 */
export async function expectNoBrokenWords(page: Page, scope = 'table'): Promise<void> {
  const broken = await page.evaluate((selector) => {
    const found: string[] = [];
    for (const cell of document.querySelectorAll(`${selector} td, ${selector} th`)) {
      const box = cell.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        if (text.trim().length < 4) continue;
        const range = document.createRange();
        const lines = new Map<number, string>();
        for (let index = 0; index < text.length; index += 1) {
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getClientRects()[0];
          if (!rect || rect.width === 0) continue;
          const top = Math.round(rect.top);
          lines.set(top, (lines.get(top) ?? '') + (text[index] ?? ''));
        }
        const pieces = [...lines.values()].map((line) => line.trim()).filter(Boolean);
        if (pieces.length > 1 && pieces.some((piece) => piece.length < 3 && !/\s/.test(piece))) {
          found.push(`${text.trim().slice(0, 40)} => ${JSON.stringify(pieces)}`);
        }
      }
    }
    return found;
  }, scope);
  expect(broken).toEqual([]);
}
