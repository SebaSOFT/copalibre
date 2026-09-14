import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LocalizedInput, type LocalizedInputLanguage } from './localized-input.js';

const LANGUAGES: readonly LocalizedInputLanguage[] = [
  { code: 'en', label: 'English', filled: true },
  { code: 'es', label: 'Español', filled: false },
];

describe('LocalizedInput', () => {
  it('renders one tab per language, as its uppercase code', () => {
    render(
      <LocalizedInput
        activeLanguage="en"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect(screen.getByRole('tab', { name: 'English' }).textContent).toContain('EN');
    expect(screen.getByRole('tab', { name: 'Español' }).textContent).toContain('ES');
  });

  it('shows the fill dot only for a language that already has text', () => {
    render(
      <LocalizedInput
        activeLanguage="en"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect(screen.getByTestId('localized-input-dot-en')).not.toBeNull();
    expect(screen.queryByTestId('localized-input-dot-es')).toBeNull();
  });

  it('marks the active language tab with aria-selected', () => {
    render(
      <LocalizedInput
        activeLanguage="es"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect(screen.getByRole('tab', { name: 'English' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Español' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('switches the active language when a tab is clicked', () => {
    const onActiveLanguageChange = jest.fn();
    render(
      <LocalizedInput
        activeLanguage="en"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={onActiveLanguageChange}
        onValueChange={() => undefined}
        value=""
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Español' }));
    expect(onActiveLanguageChange).toHaveBeenCalledWith('es');
  });

  it("edits the active language's own value, not the others", () => {
    const onValueChange = jest.fn();
    render(
      <LocalizedInput
        activeLanguage="es"
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={onValueChange}
        value="Copa"
      />,
    );
    const input = screen.getByDisplayValue('Copa');
    fireEvent.change(input, { target: { value: 'Copa de Invierno' } });
    expect(onValueChange).toHaveBeenCalledWith('Copa de Invierno');
  });

  it('disables every tab and the field together', () => {
    render(
      <LocalizedInput
        activeLanguage="en"
        disabled
        id="name"
        languages={LANGUAGES}
        onActiveLanguageChange={() => undefined}
        onValueChange={() => undefined}
        value=""
      />,
    );
    expect((screen.getByRole('tab', { name: 'English' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('tab', { name: 'Español' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByDisplayValue('') as HTMLInputElement).disabled).toBe(true);
  });
});
