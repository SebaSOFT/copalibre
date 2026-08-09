import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { StandingsPage } from '../components/StandingsPage.js';
import { SeedingBuilderPage } from '../components/SeedingBuilderPage.js';
import { RolesPermissionsPage } from '../components/RolesPermissionsPage.js';
import { activeControlLanguage } from './ControlIntl.js';
import { messages } from './messages.en.js';
import { messages as esMessages } from './messages.es.js';
import type { StandingsData } from '../lib/standings.js';

/** Wraps a component in the Spanish catalog, the same way `ControlIntl` does at `locale: 'es'`. */
function withSpanish(children: React.ReactNode): React.JSX.Element {
  return (
    <IntlProvider defaultLocale="en" locale="es" messages={esMessages}>
      {children}
    </IntlProvider>
  );
}

describe('message-catalog completeness (0053, task 6.4)', () => {
  it('has an identical key set in English and Spanish', () => {
    const englishIds = Object.values(messages)
      .map((descriptor) => descriptor.id)
      .sort();
    const spanishIds = Object.keys(esMessages).sort();

    expect(spanishIds).toEqual(englishIds);
  });

  it('has no empty translation in either catalog', () => {
    for (const descriptor of Object.values(messages)) {
      expect(descriptor.defaultMessage).toBeTruthy();
    }
    for (const value of Object.values(esMessages)) {
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
  const standings: StandingsData = {
    stageId: 'stage-1',
    projectionVersion: 3,
    fullyResolved: false,
    rows: [],
    trace: [],
  };

  it('StandingsPage', () => {
    render(
      withSpanish(
        <StandingsPage
          organizationAlias="liga-mendocina"
          standings={standings}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText('Posiciones')).toBeTruthy();
    expect(screen.getByText(/Proyección v3/)).toBeTruthy();
    expect(screen.getByText(/empate sin resolver/)).toBeTruthy();
    expect(screen.getByText('Todavía no hay resultados en esta fase.')).toBeTruthy();
  });

  it('SeedingBuilderPage', () => {
    render(
      withSpanish(
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
      withSpanish(
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
