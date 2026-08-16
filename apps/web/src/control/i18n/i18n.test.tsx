import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { StandingsPage } from '../components/StandingsPage.js';
import { SeedingBuilderPage } from '../components/SeedingBuilderPage.js';
import { RolesPermissionsPage } from '../components/RolesPermissionsPage.js';
import { activeControlLanguage } from './ControlIntl.js';
import { messages } from './messages.en.js';
import { messages as esMessages } from './messages.es.js';
import { messages as frMessages } from './messages.fr.js';
import { messages as ptMessages } from './messages.pt.js';
import { messages as itMessages } from './messages.it.js';
import { messages as deMessages } from './messages.de.js';
import { messages as ruMessages } from './messages.ru.js';
import { messages as zhMessages } from './messages.zh.js';
import type {
  TableLayoutSummaryResponse,
  TableProjectionResponseData,
} from '../lib/api-client.js';

const EMPTY_LAYOUT: TableLayoutSummaryResponse = {
  code: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  entityGranularity: 'team',
};

const EMPTY_PROJECTION: TableProjectionResponseData = {
  layoutCode: EMPTY_LAYOUT.code,
  target: EMPTY_LAYOUT.target,
  label: EMPTY_LAYOUT.label,
  columns: [{ code: 'name', header: 'Team', format: 'text' }],
  defaultSort: [],
  rows: [],
  projectionVersion: 3,
};

/** Every non-English catalog (0053 Spanish, 0054 the remaining five, 0057 Mandarin), keyed like `ControlIntl`'s `CATALOGS`. */
const NON_ENGLISH_CATALOGS: Record<string, Record<string, string>> = {
  es: esMessages,
  fr: frMessages,
  pt: ptMessages,
  it: itMessages,
  de: deMessages,
  ru: ruMessages,
  zh: zhMessages,
};

/** Wraps a component in the given catalog, the same way `ControlIntl` does for that locale. */
function withLanguage(locale: string, children: React.ReactNode): React.JSX.Element {
  return (
    <IntlProvider defaultLocale="en" locale={locale} messages={NON_ENGLISH_CATALOGS[locale]}>
      {children}
    </IntlProvider>
  );
}

describe('message-catalog completeness (0053 task 6.4, widened to all eight languages by 0054/0057)', () => {
  const englishIds = Object.values(messages)
    .map((descriptor) => descriptor.id)
    .sort();

  it.each(Object.keys(NON_ENGLISH_CATALOGS))('%s has an identical key set to English', (lang) => {
    const ids = Object.keys(NON_ENGLISH_CATALOGS[lang]).sort();
    expect(ids).toEqual(englishIds);
  });

  it('has no empty translation in the English catalog', () => {
    for (const descriptor of Object.values(messages)) {
      expect(descriptor.defaultMessage).toBeTruthy();
    }
  });

  it.each(Object.keys(NON_ENGLISH_CATALOGS))('%s has no empty translation', (lang) => {
    for (const value of Object.values(NON_ENGLISH_CATALOGS[lang])) {
      expect(value).toBeTruthy();
    }
  });
});

describe('activeControlLanguage resolution (0053, task 6.3)', () => {
  afterEach(() => localStorage.clear());

  it('resolves to Spanish by default, matching the organizationPrimaryLanguage placeholder', () => {
    expect(activeControlLanguage()).toBe('es');
  });

  it('resolves to an explicit stored preference over the placeholder', () => {
    localStorage.setItem('copalibre.language', 'fr');
    expect(activeControlLanguage()).toBe('fr');
  });

  it('falls back to the placeholder when a stored preference is not a supported language', () => {
    localStorage.setItem('copalibre.language', 'not-a-real-language');
    expect(activeControlLanguage()).toBe('es');
  });
});

describe('Spanish catalog reproduces pre-extraction wording (0053, task 6.2)', () => {
  it('StandingsPage', () => {
    render(
      withLanguage(
        'es',
        <StandingsPage
          activeLayoutCode={EMPTY_LAYOUT.code}
          layouts={[EMPTY_LAYOUT]}
          organizationAlias="liga-mendocina"
          projection={EMPTY_PROJECTION}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText('Posiciones')).toBeTruthy();
    expect(screen.getByText(/Proyección v3/)).toBeTruthy();
    expect(screen.getByText('Todavía no hay resultados en esta fase.')).toBeTruthy();
  });

  it('SeedingBuilderPage', () => {
    render(
      withLanguage(
        'es',
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={[]}
          organizationAlias="liga-mendocina"
          seeds={[]}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText('Sembrado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sortear no fijados' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar sembrado' })).toBeTruthy();
    expect(screen.getByText('Esta fase no tiene participantes.')).toBeTruthy();
  });

  it('RolesPermissionsPage', () => {
    render(
      withLanguage(
        'es',
        <RolesPermissionsPage
          loading={false}
          onChange={async () => undefined}
          onDelete={async () => undefined}
          onInvite={async () => undefined}
          organizationAlias="liga-mendocina"
          rows={[]}
        />,
      ),
    );

    expect(screen.getByText('Roles y permisos')).toBeTruthy();
    expect(screen.getByText('Añadir destinatario')).toBeTruthy();
    expect(screen.getByText('No hay usuarios asignados.')).toBeTruthy();
  });
});

describe('Non-English catalogs render real translated text, not an English fallback (0054 task 7.2, extended by 0057)', () => {
  const expectedTitleAndEmptyState: Record<string, [string, string]> = {
    fr: ['Classement', 'Il n’y a pas encore de résultats dans cette phase.'],
    pt: ['Classificação', 'Ainda não há resultados nesta fase.'],
    it: ['Classifica', 'Non ci sono ancora risultati in questa fase.'],
    de: ['Tabelle', 'In dieser Phase gibt es noch keine Ergebnisse.'],
    ru: ['Турнирная таблица', 'На этом этапе пока нет результатов.'],
    zh: ['排名', '此阶段尚无结果。'],
  };

  it.each(Object.entries(expectedTitleAndEmptyState))(
    '%s renders StandingsPage with real translated text',
    (lang, [title, emptyState]) => {
      render(
        withLanguage(
          lang,
          <StandingsPage
            activeLayoutCode={EMPTY_LAYOUT.code}
            layouts={[EMPTY_LAYOUT]}
            organizationAlias="liga-mendocina"
            projection={EMPTY_PROJECTION}
            tournamentName="Apertura"
          />,
        ),
      );

      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(emptyState)).toBeTruthy();
      expect(screen.queryByText('Standings')).toBeNull();
    },
  );
});
