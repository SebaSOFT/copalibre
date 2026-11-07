import type { Page } from '@playwright/test';

/** What an element looked like at the moment it gained the score flash. */
export interface FlashRecord {
  readonly text: string;
  readonly animationDuration: string;
  readonly transitionDuration: string;
  readonly backgroundColor: string;
  readonly expectedFlashColor: string;
}

interface FlashRecorderWindow {
  __flashRecords?: FlashRecord[];
}

/**
 * The score flash class lives for 600ms and Playwright's polling backs off to
 * 1s, so asserting on the class itself can poll on either side of it. This
 * records each flash as it happens, so a test reads what happened instead of
 * racing it. Call it before `page.goto`.
 */
export async function recordFlashes(page: Page, selector: string): Promise<void> {
  await page.addInitScript((target) => {
    const flashClass = 'cl-flash-on-change';
    const records: FlashRecord[] = [];
    (window as FlashRecorderWindow).__flashRecords = records;

    const resolvedFlashColor = (element: Element): string => {
      const probe = element.ownerDocument.createElement('span');
      probe.style.color = 'var(--cl-color-cyan-950)';
      element.ownerDocument.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target as Element;
        const gainedFlash =
          element.classList.contains(flashClass) && !mutation.oldValue?.includes(flashClass);
        if (!gainedFlash || !element.matches(target)) continue;
        const computed = getComputedStyle(element);
        records.push({
          text: element.textContent?.trim() ?? '',
          animationDuration: computed.animationDuration,
          transitionDuration: computed.transitionDuration,
          backgroundColor: computed.backgroundColor,
          expectedFlashColor: resolvedFlashColor(element),
        });
      }
    }).observe(document, {
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
      subtree: true,
    });
  }, selector);
}

/** The flashes recorded so far on the selector given to {@link recordFlashes}. */
export function recordedFlashes(page: Page): Promise<FlashRecord[]> {
  return page.evaluate(() => (window as FlashRecorderWindow).__flashRecords ?? []);
}
