import { render, screen, within } from '@testing-library/react';
import { OutcomeLegend, outcomeGlyph } from './OutcomeLegend.js';

const ENTRIES = [
  { outcome: 'advancing', label: 'Advancing' },
  { outcome: 'eliminated', label: 'Eliminated' },
] as const;

describe('the OutcomeLegend component', () => {
  it('pairs every outcome with a written label as well as a glyph', () => {
    render(<OutcomeLegend entries={ENTRIES} label="Bracket key" />);
    const legend = screen.getByRole('list', { name: 'Bracket key' });
    expect(within(legend).getByText('Advancing')).not.toBeNull();
    expect(within(legend).getByText('Eliminated')).not.toBeNull();
  });

  it('gives each outcome a distinct glyph, so the two separate without colour', () => {
    expect(outcomeGlyph('advancing')).not.toBe(outcomeGlyph('eliminated'));
    expect(outcomeGlyph('pending')).not.toBe(outcomeGlyph('advancing'));
  });

  it('marks the glyph decorative, because the word beside it is what is read', () => {
    const { container } = render(<OutcomeLegend entries={ENTRIES} label="Bracket key" />);
    const glyphs = container.querySelectorAll('.cl-outcome-legend__glyph');
    expect(glyphs).toHaveLength(2);
    for (const glyph of glyphs) expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('keys the glyph class to its outcome rather than to its fill', () => {
    const { container } = render(<OutcomeLegend entries={ENTRIES} label="Bracket key" />);
    expect(container.querySelector('.cl-outcome-legend__glyph--advancing')).not.toBeNull();
    expect(container.querySelector('.cl-outcome-legend__glyph--eliminated')).not.toBeNull();
  });

  it('lists only the outcomes it was given', () => {
    render(<OutcomeLegend entries={ENTRIES} label="Bracket key" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
