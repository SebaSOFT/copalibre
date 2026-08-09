import { publicIntl, resultStateLabels } from './public-intl.js';
import { messages } from './public-messages.en.js';
import { messages as esMessages } from './public-messages.es.js';

describe('public-web message-catalog completeness (0055 task 7.3)', () => {
  const englishIds = Object.values(messages)
    .map((descriptor) => descriptor.id)
    .sort();

  it('Spanish has an identical key set to English', () => {
    expect(Object.keys(esMessages).sort()).toEqual(englishIds);
  });

  it('has no empty translation in the English catalog', () => {
    for (const descriptor of Object.values(messages)) {
      expect(descriptor.defaultMessage).toBeTruthy();
    }
  });

  it('has no empty translation in the Spanish catalog', () => {
    for (const value of Object.values(esMessages)) {
      expect(value).toBeTruthy();
    }
  });
});

describe('publicIntl formats real translated text, not an English fallback (0055 task 7.4)', () => {
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

  it('interpolates a value into an ICU template in the resolved language', () => {
    const es = publicIntl('es');
    expect(es.formatMessage(messages.heroLiveCount, { count: 3 })).toBe('3 EN VIVO');

    const en = publicIntl('en');
    expect(en.formatMessage(messages.heroLiveCount, { count: 3 })).toBe('3 LIVE');
  });

  it('resolves every result-state label at once', () => {
    const labels = resultStateLabels(publicIntl('es'));
    expect(labels.live).toBe('EN VIVO');
    expect(labels.tbd).toBe('A DEFINIR');
    expect(labels.cancelled).toBe('CANCELADO');
  });
});
