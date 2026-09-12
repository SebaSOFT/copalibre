import {
  matchCardLabels,
  publicIntl,
  resultReasonLabels,
  resultStateLabels,
  seriesStateBarLabels,
} from './public-intl.js';
import { messages } from './public-messages.en.js';
import { messages as esMessages } from './public-messages.es.js';
import { messages as frMessages } from './public-messages.fr.js';
import { messages as ptMessages } from './public-messages.pt.js';
import { messages as itMessages } from './public-messages.it.js';
import { messages as deMessages } from './public-messages.de.js';
import { messages as ruMessages } from './public-messages.ru.js';
import { messages as zhMessages } from './public-messages.zh.js';

const NON_ENGLISH_CATALOGS = {
  Spanish: esMessages,
  French: frMessages,
  Portuguese: ptMessages,
  Italian: itMessages,
  German: deMessages,
  Russian: ruMessages,
  Mandarin: zhMessages,
};

describe('public-web message-catalog completeness', () => {
  const englishIds = Object.values(messages)
    .map((descriptor) => descriptor.id)
    .sort();

  it.each(Object.entries(NON_ENGLISH_CATALOGS))(
    '%s has an identical key set to English',
    (_name, catalog) => {
      expect(Object.keys(catalog).sort()).toEqual(englishIds);
    },
  );

  it('has no empty translation in the English catalog', () => {
    for (const descriptor of Object.values(messages)) {
      expect(descriptor.defaultMessage).toBeTruthy();
    }
  });

  it.each(Object.entries(NON_ENGLISH_CATALOGS))(
    'has no empty translation in %s',
    (_name, catalog) => {
      for (const value of Object.values(catalog)) {
        expect(value).toBeTruthy();
      }
    },
  );
});

describe('publicIntl formats real translated text, not an English fallback', () => {
  it('renders Spanish chrome for a plain string', () => {
    const intl = publicIntl('es');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Referencias');
    expect(intl.formatMessage(messages.standingsHeading)).toBe('Posiciones');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('renders English chrome for the primary locale', () => {
    const intl = publicIntl('en');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Legend');
  });

  it('renders French chrome for a plain string', () => {
    const intl = publicIntl('fr');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Légende');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('renders Portuguese chrome for a plain string', () => {
    const intl = publicIntl('pt');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Legenda');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('renders Italian chrome for a plain string', () => {
    const intl = publicIntl('it');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Legenda');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('renders German chrome for a plain string', () => {
    const intl = publicIntl('de');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Legende');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('renders Russian chrome for a plain string', () => {
    const intl = publicIntl('ru');
    expect(intl.formatMessage(messages.legendHeading)).toBe('Легенда');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('renders Mandarin chrome for a plain string', () => {
    const intl = publicIntl('zh');
    expect(intl.formatMessage(messages.legendHeading)).toBe('图例');
    expect(intl.formatMessage(messages.legendHeading)).not.toBe('Legend');
  });

  it('interpolates a value into an ICU template in the resolved language', () => {
    const es = publicIntl('es');
    expect(es.formatMessage(messages.heroLiveCount, { count: 3 })).toBe('3 EN VIVO');

    const en = publicIntl('en');
    expect(en.formatMessage(messages.heroLiveCount, { count: 3 })).toBe('3 LIVE');

    const de = publicIntl('de');
    expect(de.formatMessage(messages.heroLiveCount, { count: 3 })).toBe('3 LIVE');
  });

  it('resolves every result-state label at once', () => {
    const labels = resultStateLabels(publicIntl('es'));
    expect(labels.live).toBe('EN VIVO');
    expect(labels.tbd).toBe('A DEFINIR');
    expect(labels.cancelled).toBe('CANCELADO');
  });

  it('resolves every non-played result-reason label at once', () => {
    const labels = resultReasonLabels(publicIntl('es'));
    expect(labels.walkover).toBe('W/O');
    expect(labels.disqualified).toBe('DESCALIFICADO');
    expect(labels['administrative-loss']).toBe('DERROTA ADM.');
    expect(labels['forfeit-abandonment']).toBe('ABANDONO');
    expect(labels['did-not-finish']).toBe('NO TERMINÓ');

    const en = resultReasonLabels(publicIntl('en'));
    expect(en.walkover).toBe('W/O');
  });

  it('resolves matches-view labels as unfilled {placeholder} templates, not formatted values', () => {
    // These must stay raw templates, never functions: MatchCard mounts on
    // the public site via `client:load`, and Astro JSON-serializes island
    // props, which a function does not survive.
    const labels = matchCardLabels(publicIntl('es'));
    expect(labels.clockAriaLabel).toBe('Tiempo transcurrido: {time}');
    expect(labels.decidedBy).toBe('Decidido por: {factor}');
    expect(labels.seriesAriaLabel).toBe('Serie al mejor de {bestOf}: {home} a {away}');
    expect(labels.filters.live).toBe('En vivo');
    expect(labels.state.final).toBe('FINAL');
  });
});

describe('seriesStateBarLabels', () => {
  const intl = publicIntl('en');

  it('renders every segment state in one series', () => {
    // pos1 played (home), pos2 played (away), pos3 in-progress, pos4 upcoming, pos5 not-required.
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 5, results: ['home', 'away'], inProgress: true, notRequired: [5] },
      {},
    );
    expect(labels.segments.map((segment) => segment.state)).toEqual([
      'won-home',
      'won-away',
      'current',
      'upcoming',
      'not-required',
    ]);
    expect(labels.segments.map((segment) => segment.mark)).toEqual(['▲', '▼', '●', '·', '×']);
    expect(labels.homeScore).toBe(1);
    expect(labels.awayScore).toBe(1);
  });

  it('reports a pending outcome when no winner is decided yet', () => {
    const labels = seriesStateBarLabels(intl, { bestOf: 3, results: ['home'] }, {});
    expect(labels.winner).toBeUndefined();
    expect(labels.outcomeText).toBe('Series undecided at 1–0');
    expect(labels.aggregateText).toBeUndefined();
  });

  it('names the home winner by name when one is provided', () => {
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 3, results: ['home', 'home'] },
      { winner: 'home', homeName: 'Nova' },
    );
    expect(labels.outcomeText).toBe('Nova won the series');
  });

  it('falls back to "1" for an unnamed home winner', () => {
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 3, results: ['home', 'home'] },
      { winner: 'home' },
    );
    expect(labels.outcomeText).toBe('1 won the series');
  });

  it('names the away winner by name when one is provided', () => {
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 3, results: ['away', 'away'] },
      { winner: 'away', awayName: 'Zenith' },
    );
    expect(labels.outcomeText).toBe('Zenith won the series');
  });

  it('falls back to "2" for an unnamed away winner', () => {
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 3, results: ['away', 'away'] },
      { winner: 'away' },
    );
    expect(labels.outcomeText).toBe('2 won the series');
  });

  it('reports an aggregate score when both sides are given', () => {
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 1, results: ['home'] },
      { winner: 'home', aggregateScores: [4, 2] },
    );
    expect(labels.aggregateText).toBe('On aggregate 4–2');
  });

  it('defaults a missing aggregate side to zero', () => {
    const labels = seriesStateBarLabels(
      intl,
      { bestOf: 1, results: ['home'] },
      { winner: 'home', aggregateScores: [4] },
    );
    expect(labels.aggregateText).toBe('On aggregate 4–0');
  });
});
