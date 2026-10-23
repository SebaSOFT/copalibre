import { fireEvent, render, screen } from '@testing-library/react';
import { EntrantEmblem } from './EntrantEmblem.js';

describe('EntrantEmblem', () => {
  it('renders a loaded crest with the entrant as its accessible name', () => {
    render(<EntrantEmblem alt="Concepción Patín Club" src="/crest.png" />);

    expect(
      screen
        .getByRole('img', { name: 'Concepción Patín Club' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe('/crest.png');
  });

  it('renders the stored abbreviation without changing its casing', () => {
    render(<EntrantEmblem abbreviation="CPC" alt="Concepción Patín Club" />);

    expect(
      screen.getByRole('img', { name: 'Concepción Patín Club' }).textContent?.includes('CPC'),
    ).toBe(true);
  });

  it('keeps four characters in a single line in a 24px frame', () => {
    render(<EntrantEmblem abbreviation="ESTM" alt="Estudiantil San Miguel" size={24} />);

    const monogram = screen.getByText('ESTM');
    expect(monogram.classList.contains('cl-entrant-emblem__monogram--small-tight')).toBe(true);
    expect(
      monogram.closest('.cl-entrant-emblem')?.classList.contains('cl-entrant-emblem--micro'),
    ).toBe(true);
  });

  it('uses the shield when abbreviation is absent or too long', () => {
    const { rerender } = render(<EntrantEmblem alt="Concepción Patín Club" />);
    const shield = screen.getByRole('img', { name: 'Concepción Patín Club' });
    expect(shield.querySelector('svg')).not.toBeNull();

    rerender(<EntrantEmblem abbreviation="PANAMER" alt="Concepción Patín Club" />);
    expect(
      screen.getByRole('img', { name: 'Concepción Patín Club' }).querySelector('svg'),
    ).not.toBeNull();
    expect(screen.queryByText('PANAMER')).toBeNull();
  });

  it('swaps a failed crest to the stored abbreviation', () => {
    render(<EntrantEmblem abbreviation="CPC" alt="Concepción Patín Club" src="/broken.png" />);

    const image = screen.getByRole('img', { name: 'Concepción Patín Club' }).querySelector('img');
    if (!image) throw new Error('loaded emblem should include an image element');
    fireEvent.error(image);

    expect(
      screen.getByRole('img', { name: 'Concepción Patín Club' }).textContent?.includes('CPC'),
    ).toBe(true);
  });

  it('hides a bare emblem from assistive technology when the name is beside it', () => {
    render(<EntrantEmblem abbreviation="CPC" alt="Concepción Patín Club" bare />);

    expect(screen.queryByRole('img', { name: 'Concepción Patín Club' })).toBeNull();
    expect(screen.getByText('CPC').closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
