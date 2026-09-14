import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LocalizedFieldTabs, type LocalizedFieldLanguage } from './localized-field-tabs.js';

const LANGUAGES: readonly LocalizedFieldLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: false },
];

describe('LocalizedFieldTabs', () => {
  it('renders one tab per language, as its uppercase code', () => {
    render(
      <LocalizedFieldTabs
        activeLanguage="en"
        controls="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: 'English' }).textContent).toContain('EN');
    expect(screen.getByRole('tab', { name: 'Español' }).textContent).toContain('ES');
  });

  it('shows the fill dot only for a language that already has text', () => {
    render(
      <LocalizedFieldTabs
        activeLanguage="en"
        controls="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
      />,
    );
    expect(screen.getByTestId('localized-field-dot-en')).not.toBeNull();
    expect(screen.queryByTestId('localized-field-dot-es')).toBeNull();
  });

  it('marks the active language tab with aria-selected', () => {
    render(
      <LocalizedFieldTabs
        activeLanguage="es"
        controls="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: 'English' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Español' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('points every tab at the field it controls', () => {
    render(
      <LocalizedFieldTabs
        activeLanguage="en"
        controls="the-field-id"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: 'English' }).getAttribute('aria-controls')).toBe(
      'the-field-id',
    );
  });

  it('switches the active language when a tab is clicked', () => {
    const onActiveLanguageChange = jest.fn();
    render(
      <LocalizedFieldTabs
        activeLanguage="en"
        controls="name"
        languages={LANGUAGES}
        onActiveLanguageChange={onActiveLanguageChange}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Español' }));
    expect(onActiveLanguageChange).toHaveBeenCalledWith('es');
  });

  it('disables every tab', () => {
    render(
      <LocalizedFieldTabs
        activeLanguage="en"
        controls="name"
        disabled
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
      />,
    );
    expect((screen.getByRole('tab', { name: 'English' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('tab', { name: 'Español' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
