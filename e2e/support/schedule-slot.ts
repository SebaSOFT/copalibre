import type { Locator } from '@playwright/test';

/**
 * Picks a match's slot the way an operator does: its day first, then the slot of that day.
 * `startsAt` names the day when the test knows the slot; `index` takes the first day listed.
 */
export async function chooseSlot(
  day: Locator,
  slot: Locator,
  choice:
    { readonly slotId: string; readonly startsAt: string | number } | { readonly index: number },
): Promise<void> {
  if ('startsAt' in choice) {
    const key = await day.evaluate(
      (_element, startsAt) => new Date(startsAt).toLocaleDateString('en-CA'),
      choice.startsAt,
    );
    await day.selectOption(key);
    await slot.selectOption(choice.slotId);
    return;
  }
  const first = await day.locator('option:not([disabled])').first().getAttribute('value');
  if (first === null) throw new Error('The day control lists no days.');
  await day.selectOption(first);
  await slot.selectOption({ index: choice.index });
}
