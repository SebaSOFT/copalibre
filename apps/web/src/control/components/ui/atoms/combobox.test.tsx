import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { Combobox, type ComboboxOption } from './combobox.js';

const OPTIONS: readonly ComboboxOption[] = [
  { value: 'weather', label: 'Weather', group: 'Common' },
  { value: 'venue', label: 'Venue unavailable', group: 'Common' },
  { value: 'recent', label: 'Lights out', group: 'Recent' },
];

function renderCombobox(value = '') {
  const onValueChange = jest.fn<(value: string, option?: ComboboxOption) => void>();
  render(
    <Combobox
      aria-label="Reason"
      id="reason"
      onValueChange={onValueChange}
      options={OPTIONS}
      value={value}
    />,
  );
  return { onValueChange, input: screen.getByRole('combobox', { name: 'Reason' }) };
}

describe('Combobox', () => {
  it('lists grouped suggestions on focus and narrows them to the typed text', () => {
    const { input } = renderCombobox('ven');
    fireEvent.focus(input);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Venue unavailable',
    ]);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('reports typed text, and the option it equals exactly', () => {
    const { input, onValueChange } = renderCombobox();
    fireEvent.change(input, { target: { value: 'Something else' } });
    expect(onValueChange).toHaveBeenLastCalledWith('Something else', undefined);
    fireEvent.change(input, { target: { value: 'Weather' } });
    expect(onValueChange).toHaveBeenLastCalledWith('Weather', OPTIONS[0]);
  });

  it('moves through suggestions with the arrows and takes the active one on Enter', () => {
    const { input, onValueChange } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-1$/);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onValueChange).toHaveBeenLastCalledWith('Venue unavailable', OPTIONS[1]);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and picks with the pointer', () => {
    const { input, onValueChange } = renderCombobox();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Lights out' }));
    expect(onValueChange).toHaveBeenLastCalledWith('Lights out', OPTIONS[2]);
  });
});
