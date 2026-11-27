import { messages as control } from './messages.en.js';
import { messages as es } from './messages.es.js';
import { messages as pt } from './messages.pt.js';
import { messages as fr } from './messages.fr.js';
import { messages as itMessages } from './messages.it.js';
import { messages as de } from './messages.de.js';
import { messages as ru } from './messages.ru.js';
import { messages as zh } from './messages.zh.js';
import { messages as publicMessages } from '../../lib/i18n/public-messages.en.js';
import { messages as publicEs } from '../../lib/i18n/public-messages.es.js';
import { messages as publicPt } from '../../lib/i18n/public-messages.pt.js';
import { messages as publicFr } from '../../lib/i18n/public-messages.fr.js';
import { messages as publicIt } from '../../lib/i18n/public-messages.it.js';
import { messages as publicDe } from '../../lib/i18n/public-messages.de.js';
import { messages as publicRu } from '../../lib/i18n/public-messages.ru.js';
import { messages as publicZh } from '../../lib/i18n/public-messages.zh.js';

const controlEntries = Object.values(control).filter(
  ({ id }) =>
    id?.startsWith('control.interaction.') ||
    /^control\.matchConsole\.(online|offline|queuedCount|lastSynced|neverSynced)$/.test(id ?? ''),
);
const publicEntries = Object.values(publicMessages).filter(
  ({ id }) => id?.startsWith('publicWeb.interaction.') || id === 'publicWeb.ticker.stale',
);
const english = Object.fromEntries(
  controlEntries.map(({ id, defaultMessage }) => [id, defaultMessage]),
);
const publicEnglish = Object.fromEntries(
  publicEntries.map(({ id, defaultMessage }) => [id, defaultMessage]),
);

describe('Interaction-state catalogue coverage', () => {
  it.each(Object.entries({ en: english, es, pt, fr, it: itMessages, de, ru, zh }))(
    'includes every control state and recovery message in %s',
    (_locale, catalogue) => {
      for (const { id } of controlEntries) expect(catalogue[id ?? '']).toEqual(expect.any(String));
    },
  );
  it.each(
    Object.entries({
      en: publicEnglish,
      es: publicEs,
      pt: publicPt,
      fr: publicFr,
      it: publicIt,
      de: publicDe,
      ru: publicRu,
      zh: publicZh,
    }),
  )('includes every public/TV state and recovery message in %s', (_locale, catalogue) => {
    for (const { id } of publicEntries) expect(catalogue[id ?? '']).toEqual(expect.any(String));
  });
});
