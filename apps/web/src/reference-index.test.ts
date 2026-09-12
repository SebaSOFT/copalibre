/**
 * The index has to be true, or it is worse than not having one.
 *
 * A row naming a consumer that does not exist, or a story file that was
 * renamed, turns the index into a record of what somebody intended rather than
 * of what shipped — which is the exact failure the index was added to prevent.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCE_INDEX } from './control/components/ui/reference-index.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Every story title declared anywhere under `src`, from the files themselves. */
function declaredStoryTitles(directory: string): readonly string[] {
  const titles: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      titles.push(...declaredStoryTitles(full));
      continue;
    }
    if (!entry.name.endsWith('.stories.tsx')) continue;
    const match = /title:\s*'([^']+)'/.exec(readFileSync(full, 'utf8'));
    if (match?.[1] !== undefined) titles.push(match[1]);
  }
  return titles;
}

const titles = declaredStoryTitles(here);

describe('the 0223 reference index', () => {
  it('lists every reference exactly once', () => {
    const names = REFERENCE_INDEX.map((entry) => entry.reference);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names a story that a stories file actually declares', () => {
    for (const entry of REFERENCE_INDEX) {
      const [title] = entry.storyId.split(' — ');
      expect(titles).toContain(title?.trim());
    }
  });

  it('names the story within the title, not just the title', () => {
    for (const entry of REFERENCE_INDEX) {
      expect(entry.storyId).toContain('—');
    }
  });

  it('names only production consumers that exist on disk', () => {
    for (const entry of REFERENCE_INDEX) {
      for (const consumer of entry.consumers) {
        expect({ consumer, exists: existsSync(join(here, consumer)) }).toEqual({
          consumer,
          exists: true,
        });
      }
    }
  });

  it('explains every row that has no consumer, rather than leaving it blank', () => {
    for (const entry of REFERENCE_INDEX.filter((row) => row.consumers.length === 0)) {
      expect(entry.note ?? '').not.toBe('');
    }
  });

  it('records every reference with no production consumer, predecessor or standing exemption alike', () => {
    // A regression on the predecessor entries means one of them gained a
    // consumer — good news that should update the index rather than be
    // discovered by a reviewer. A standing exemption (the preview seam) is
    // never expected to leave this list at all.
    //
    // 'Locale control' left this list in openspec 0225 task 4.3a: it now
    // points at LanguageSwitcher's own story, and LanguageSwitcher is a real,
    // consumed component (ControlShell.tsx), not a predecessor recorded for
    // want of one. 'Live match scorecard' stays — merging LiveMatchScorecard's
    // implementation into MatchCard.tsx (task 4.3) resolved its file-level
    // orphan status, not this: the live page still renders LiveMatchHero, so
    // this specific presentation still ships nowhere. 'Astro preview seam'
    // joined in task 4.5: the development preview seam itself, permanently
    // unconsumed by design (it answers 404 in a build).
    expect(
      REFERENCE_INDEX.filter((entry) => entry.consumers.length === 0).map(
        (entry) => entry.reference,
      ),
    ).toEqual(['Live match scorecard', 'Astro preview seam']);
  });
});
