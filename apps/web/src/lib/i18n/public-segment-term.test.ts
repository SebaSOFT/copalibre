import { TV_LAUNCHER_LABELS } from '../tv-launcher-labels.js';
import { messages as enMessages } from './public-messages.en.js';
import { messages as esMessages } from './public-messages.es.js';
import { messages as deMessages } from './public-messages.de.js';
import { messages as frMessages } from './public-messages.fr.js';
import { messages as itMessages } from './public-messages.it.js';
import { messages as ptMessages } from './public-messages.pt.js';
import { messages as ruMessages } from './public-messages.ru.js';
import { messages as zhMessages } from './public-messages.zh.js';

type Language = 'en' | 'es' | 'de' | 'fr' | 'it' | 'pt' | 'ru' | 'zh';

/**
 * Words the glossary (`docs/i18n-glossary.md`, `segment`) avoids for the generic match segment.
 * `period` words never get the stage exception. `stage` words (phase, fase, Phase, фаза, 阶段)
 * are allowed where the text names a tournament stage, see `isStageException`.
 */
interface LanguageRules {
  readonly period: RegExp;
  readonly stage: RegExp;
}

/** Unicode-aware whole-word match: `\b` does not treat Cyrillic or accented letters as word parts. */
function whole(body: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'iu');
}

const rules: Record<Language, LanguageRules> = {
  en: { period: whole('periods?'), stage: whole('phases?') },
  es: { period: whole('per[ií]odos?'), stage: whole('fases?') },
  fr: { period: whole('p[ée]riodes?'), stage: whole('phases?') },
  pt: { period: whole('per[ií]odos?'), stage: whole('fases?') },
  it: { period: whole('period[oi]'), stage: whole('fas[ei]') },
  // German compounds ("Spielphase", "Zeitabschnitt") hide the word inside a longer noun, so
  // German matches substrings, as the control-surface test does.
  de: { period: /period|abschnitt/iu, stage: /phase/iu },
  ru: {
    period: whole(
      'период(?:а|ы|у|ом|е|ов|ам|ами|ах)?|отрез(?:ок|ка|ку|ке|ком|ки|ков|кам|ками|ках)',
    ),
    stage: whole('фаз(?:а|ы|е|у|ой|ам|ами|ах)?'),
  },
  // Chinese has no word boundaries, so these are plain substring matches.
  zh: { period: /赛段/u, stage: /阶段/u },
};

function fromDescriptors(
  source: Record<string, { id: string; defaultMessage: string }>,
): Record<string, string> {
  return Object.fromEntries(Object.values(source).map((entry) => [entry.id, entry.defaultMessage]));
}

function publicOnly(source: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([id]) => id.startsWith('publicWeb.')));
}

const publicCatalogues: Record<Language, Record<string, string>> = {
  en: publicOnly(
    fromDescriptors(
      enMessages as unknown as Record<string, { id: string; defaultMessage: string }>,
    ),
  ),
  es: publicOnly(esMessages as Record<string, string>),
  de: publicOnly(deMessages as Record<string, string>),
  fr: publicOnly(frMessages as Record<string, string>),
  it: publicOnly(itMessages as Record<string, string>),
  pt: publicOnly(ptMessages as Record<string, string>),
  ru: publicOnly(ruMessages as Record<string, string>),
  zh: publicOnly(zhMessages as Record<string, string>),
};

/** The TV launcher keeps its own words outside the catalogue; ids are prefixed to read like one. */
function launcherLabels(lang: Language): Record<string, string> {
  return Object.fromEntries(
    Object.entries(TV_LAUNCHER_LABELS[lang]).map(([key, text]) => [`tvLauncher.${key}`, text]),
  );
}

/**
 * A stage word is allowed under a key with a part that starts with `stage`
 * (`publicWeb.breadcrumb.stage`, `publicWeb.stageZonesPage.title`, `tvLauncher.stage`), or in a
 * text with a `{stage…}` placeholder.
 */
function isStageException(id: string, text: string): boolean {
  return id.split('.').some((part) => part.startsWith('stage')) || /\{stage/.test(text);
}

/** Placeholder names are code, not words a reader sees. */
function withoutPlaceholders(text: string): string {
  return text.replace(/\{[A-Za-z]\w*\}/g, '');
}

/** Returns one line per entry whose text uses an avoided word for the generic segment. */
function findViolations(catalogue: Record<string, string>, languageRules: LanguageRules): string[] {
  const violations: string[] = [];
  for (const [id, text] of Object.entries(catalogue)) {
    const readable = withoutPlaceholders(text);
    const period = languageRules.period.exec(readable);
    if (period) {
      violations.push(`${id}: period word "${period[0]}"`);
      continue;
    }
    const stage = languageRules.stage.exec(readable);
    if (stage && !isStageException(id, text)) {
      violations.push(`${id}: stage word "${stage[0]}" outside a stage key`);
    }
  }
  return violations;
}

describe('public and TV text names the generic match segment by its glossary word', () => {
  it('reads a non-trivial number of entries in every language', () => {
    for (const lang of Object.keys(rules) as Language[]) {
      expect({ lang, publicWeb: Object.keys(publicCatalogues[lang]).length > 300 }).toEqual({
        lang,
        publicWeb: true,
      });
      expect({ lang, tvLauncher: Object.keys(launcherLabels(lang)).length > 10 }).toEqual({
        lang,
        tvLauncher: true,
      });
    }
  });

  for (const lang of Object.keys(rules) as Language[]) {
    it(`${lang}: no public catalogue string uses an avoided segment word`, () => {
      expect(findViolations(publicCatalogues[lang], rules[lang])).toEqual([]);
    });

    it(`${lang}: no TV launcher label uses an avoided segment word`, () => {
      expect(findViolations(launcherLabels(lang), rules[lang])).toEqual([]);
    });
  }

  it('fixture: a period word under a stage key still fails', () => {
    const fixture = {
      'publicWeb.stage.fixturePeriod': 'Período 2 de 3',
      'publicWeb.stage.fixtureStage': 'Fase de grupos',
      'publicWeb.matchLabel.fixturePlaceholder': '{stage}: Fase {number}',
    };
    expect(findViolations(fixture, rules.es)).toEqual([
      'publicWeb.stage.fixturePeriod: period word "Período"',
    ]);
  });

  it('fixture: a stage word outside a stage key fails, also under a key that only contains "stage"', () => {
    const fixture = {
      'publicWeb.tvDashboard.currentPart': 'Fase 2',
      'publicWeb.backstage.title': 'Fase 2',
    };
    expect(findViolations(fixture, rules.es)).toEqual([
      'publicWeb.tvDashboard.currentPart: stage word "Fase" outside a stage key',
      'publicWeb.backstage.title: stage word "Fase" outside a stage key',
    ]);
  });

  it('fixture: inflected and compound forms are caught', () => {
    expect(findViolations({ 'publicWeb.x': 'Secondi periodi' }, rules.it)).toEqual([
      'publicWeb.x: period word "periodi"',
    ]);
    expect(findViolations({ 'publicWeb.x': 'Aktuelle Spielphase' }, rules.de)).toEqual([
      'publicWeb.x: stage word "phase" outside a stage key',
    ]);
    expect(findViolations({ 'publicWeb.x': 'Zwei Zeitabschnitte' }, rules.de)).toEqual([
      'publicWeb.x: period word "abschnitt"',
    ]);
    expect(findViolations({ 'publicWeb.x': 'Конец отрезка' }, rules.ru)).toEqual([
      'publicWeb.x: period word "отрезка"',
    ]);
    expect(findViolations({ 'publicWeb.x': 'Две фазы' }, rules.ru)).toEqual([
      'publicWeb.x: stage word "фазы" outside a stage key',
    ]);
  });

  it('fixture: a placeholder name is not a word', () => {
    expect(findViolations({ 'publicWeb.x': 'Clock {period}' }, rules.en)).toEqual([]);
  });
});
