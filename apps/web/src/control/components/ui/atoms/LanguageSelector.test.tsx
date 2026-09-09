import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LanguageSelector } from './LanguageSelector.js';

describe('the LanguageSelector atom', () => {
  it('renders the 文A translation glyph and active uppercase locale code', () => {
    render(<LanguageSelector currentLocale="es" />);

    expect(screen.getByText('文A')).not.toBeNull();
    expect(screen.getByText('es')).not.toBeNull();
  });

  it('renders accessible select element and calls onSelectLocale on change', () => {
    const onSelectMock = jest.fn();
    render(<LanguageSelector currentLocale="en" onSelectLocale={onSelectMock} />);

    const select = screen.getByRole('combobox', { name: /select language/i });
    expect(select).not.toBeNull();

    fireEvent.change(select, { target: { value: 'de' } });
    expect(onSelectMock).toHaveBeenCalledWith('de');
  });
});
