import { describe, expect, it } from '@jest/globals';
import { createIntl, createIntlCache } from 'react-intl';
import { SUPPORTED_LANGUAGES } from '@copalibre/domain';
import { CATALOGS as CONTROL_CATALOGS } from '../control/i18n/ControlIntl.js';
import {
  TIEBREAKER_LABELS as CONTROL_TIEBREAKER_LABELS,
  formatTiebreakerCode as formatControlTiebreakerCode,
} from '../control/lib/tiebreaker-labels.js';
import { publicIntl } from './i18n/public-intl.js';
import {
  PUBLIC_TIEBREAKER_LABELS,
  TIEBREAKER_CODES,
  formatPublicTiebreakerCode,
  humanizeCode,
  resolveTiebreakerLabel,
  tiebreakerLabelsForCatalog,
} from './tiebreaker-labels.js';

const controlCache = createIntlCache();

function controlIntl(locale: (typeof SUPPORTED_LANGUAGES)[number]) {
  return createIntl(
    {
      locale,
      defaultLocale: 'en',
      messages: CONTROL_CATALOGS[locale],
    },
    controlCache,
  );
}

describe('tiebreaker-labels', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'resolves every canonical code in %s for both public and control catalogues',
    (language) => {
      const pubIntl = publicIntl(language);
      const ctrlIntl = controlIntl(language);
      const publicMap = tiebreakerLabelsForCatalog(pubIntl, PUBLIC_TIEBREAKER_LABELS);
      const controlMap = tiebreakerLabelsForCatalog(ctrlIntl, CONTROL_TIEBREAKER_LABELS);

      for (const code of TIEBREAKER_CODES) {
        const publicLabel = formatPublicTiebreakerCode(pubIntl, code);
        const controlLabel = formatControlTiebreakerCode(ctrlIntl, code);

        expect(publicLabel.length).toBeGreaterThan(0);
        expect(publicLabel).not.toBe(code);
        expect(publicLabel).not.toContain('publicWeb.ruleset.tiebreaker.');
        expect(publicMap[code]).toBe(publicLabel);

        expect(controlLabel.length).toBeGreaterThan(0);
        expect(controlLabel).not.toBe(code);
        expect(controlLabel).not.toContain('control.tiebreaker.');
        expect(controlMap[code]).toBe(controlLabel);
      }
    },
  );

  it('matches Spanish public tiebreaker wording', () => {
    expect(formatPublicTiebreakerCode(publicIntl('es'), 'goal-average')).toBe('Promedio de goles');
    expect(formatControlTiebreakerCode(controlIntl('es'), 'goal-average')).toBe(
      'Promedio de goles',
    );
  });

  it('humanizes unknown codes into sentence-case words', () => {
    expect(humanizeCode('sets-won')).toBe('Sets won');
    expect(humanizeCode('disciplinary_points')).toBe('Disciplinary points');
    expect(humanizeCode('headToHead')).toBe('Head To Head');
    expect(formatPublicTiebreakerCode(publicIntl('es'), 'disciplinary-points')).toBe(
      'Disciplinary points',
    );
  });

  it('resolves declared label first, else catalogue map, else humanized code', () => {
    const esMap = tiebreakerLabelsForCatalog(publicIntl('es'), PUBLIC_TIEBREAKER_LABELS);

    expect(resolveTiebreakerLabel('custom-rule', esMap, 'Penales', 'es')).toBe('Penales');
    expect(
      resolveTiebreakerLabel('custom-rule', esMap, { en: 'Fair play', es: 'Juego limpio' }, 'es'),
    ).toBe('Juego limpio');
    expect(resolveTiebreakerLabel('goal-average', esMap, undefined, 'es')).toBe(
      'Promedio de goles',
    );
    expect(resolveTiebreakerLabel('disciplinary-points', esMap, undefined, 'es')).toBe(
      'Disciplinary points',
    );
    expect(resolveTiebreakerLabel('disciplinary-points')).toBe('Disciplinary points');
  });
});
