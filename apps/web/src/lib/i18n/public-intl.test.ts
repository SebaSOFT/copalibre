import { publicIntl, resultStateLabels } from './public-intl.js';
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

describe('public-web message-catalog completeness (0055 task 7.3, 0056 task 8.1, 0057 task 4.6)', () => {
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

describe('publicIntl formats real translated text, not an English fallback (0055 task 7.4, 0056 task 8.2, 0057 task 4.6)', () => {
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
});
