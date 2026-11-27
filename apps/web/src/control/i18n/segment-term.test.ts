import { messages as control } from './messages.en.js';
import { messages as es } from './messages.es.js';
import { messages as pt } from './messages.pt.js';
import { messages as fr } from './messages.fr.js';
import { messages as itMessages } from './messages.it.js';
import { messages as de } from './messages.de.js';
import { messages as ru } from './messages.ru.js';
import { messages as zh } from './messages.zh.js';

/**
 * The generic match segment has one word per control language. The stems
 * below match the singular and plural forms (`segmento`/`segmenti`,
 * `Segment`/`Segmente`, `сегмент`/`сегменты`). Source: docs/i18n-glossary.md,
 * `segment`.
 */
const segmentStem: Record<string, string> = {
  en: 'segment',
  es: 'segment',
  fr: 'segment',
  pt: 'segment',
  it: 'segment',
  de: 'segment',
  ru: 'сегмент',
  zh: '分段',
};

/**
 * Words the glossary forbids for the generic concept (period, phase, Abschnitt, tempo, отрезок,
 * 赛段, 阶段).
 */
const avoidedWords =
  /per[ií]odo|period|période|период|\bfas(?:e|es|i)\b|phase|фаз|отрез|Abschnitt|Spielzeit|\btiempos?\b|\btempos?\b|\btempi\b|赛段|阶段/i;

/**
 * Keys that do not name the generic concept by a noun. The id contains
 * "egment" for these, but they are type names, durations or states.
 */
const notNamingIds =
  /segmentType$|segmentTypePlaceholder|segmentElapsedSeconds|fieldSegmentTimed|segmentTimed|segmentUntimed/;

const catalogues: Record<string, Record<string, string>> = {
  en: flatten(control as unknown as Record<string, { id: string; defaultMessage: string }>),
  es: es as Record<string, string>,
  fr: fr as Record<string, string>,
  pt: pt as Record<string, string>,
  it: itMessages as Record<string, string>,
  de: de as Record<string, string>,
  ru: ru as Record<string, string>,
  zh: zh as Record<string, string>,
};

function flatten(
  source: Record<string, { id: string; defaultMessage: string }>,
): Record<string, string> {
  return Object.fromEntries(Object.values(source).map((entry) => [entry.id, entry.defaultMessage]));
}

/**
 * Removes parenthetical lists of example type names, such as "(halves, sets, rounds)". Example
 * names are exempt from the glossary, so they are not checked for avoided words. Only a list (a
 * parenthetical with a comma) is removed; any other parenthetical is still checked.
 */
function withoutExamples(text: string): string {
  return withoutPlaceholders(text).replace(/[(（][^()（）]*[,，、][^()（）]*[)）]/g, '');
}

/** Removes simple ICU placeholders such as {segment} or {name}; plural branches stay. */
function withoutPlaceholders(text: string): string {
  return text.replace(/\{[a-zA-Z]+\}/g, '');
}

/**
 * The keys that name the generic segment: the English text says "segment" outside placeholders.
 * Selecting by text, not only by id, also covers ids that predate the term, such as
 * `control.matchConsole.clockAndPeriod`.
 */
const segmentKeys = Object.keys(catalogues.en).filter(
  (id) => !notNamingIds.test(id) && /segment/i.test(withoutPlaceholders(catalogues.en[id] ?? '')),
);

describe('Generic match segment uses one word per control language', () => {
  it('finds the segment keys the rule covers', () => {
    expect(segmentKeys).toContain('control.loadMatchData.segmentsHeading');
    expect(segmentKeys).toContain('control.descriptor.decisionSegmentTypes');
    expect(segmentKeys).toContain('control.disciplineSummary.segmentsFieldValue');
    expect(segmentKeys).toContain('control.matchConsole.clockAndPeriod');
    expect(segmentKeys.length).toBeGreaterThan(20);
  });

  for (const [lang, catalogue] of Object.entries(catalogues)) {
    it(`${lang}: every segment key uses the glossary word and no avoided word`, () => {
      const failures: string[] = [];
      for (const id of segmentKeys) {
        const text = catalogue[id];
        if (text === undefined) {
          failures.push(`${id}: missing`);
          continue;
        }
        if (!text.toLowerCase().includes(segmentStem[lang].toLowerCase())) {
          failures.push(`${id}: no segment word in "${text}"`);
        }
        if (avoidedWords.test(withoutExamples(text))) {
          failures.push(`${id}: avoided word in "${text}"`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('zh: the catalogue has no 赛段 left', () => {
    const offending = Object.entries(catalogues.zh).filter(([, text]) => text.includes('赛段'));
    expect(offending).toEqual([]);
  });

  it('zh: promotion strings never say 分段, bands are 分档', () => {
    const promotionIds = Object.keys(catalogues.zh).filter((id) =>
      id.startsWith('control.promotion.'),
    );
    const withSegmentWord = promotionIds.filter((id) => catalogues.zh[id]?.includes('分段'));
    expect(withSegmentWord).toEqual([]);
    expect(catalogues.zh['control.promotion.bandsHeading']).toContain('分档');
    expect(catalogues.zh['control.promotion.addBand']).toContain('分档');
    expect(catalogues.zh['control.promotion.removeBand']).toContain('分档');
  });
});
