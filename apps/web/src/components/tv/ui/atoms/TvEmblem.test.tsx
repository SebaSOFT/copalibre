import { fireEvent, render, screen } from '@testing-library/react';
import { TvEmblem } from './TvEmblem.js';

describe('TvEmblem', () => {
  it('shows the emblem when it has a source', () => {
    render(<TvEmblem alt="Club" className="e" fallback={<span>CL</span>} src="/e.png" />);
    expect(screen.getByAltText('Club').getAttribute('src')).toBe('/e.png');
    expect(screen.queryByText('CL')).toBeNull();
  });

  it('shows the fallback when there is no source', () => {
    render(<TvEmblem alt="Club" className="e" fallback={<span>CL</span>} />);
    expect(screen.getByText('CL')).toBeDefined();
    expect(screen.queryByAltText('Club')).toBeNull();
  });

  it('swaps to the fallback when the request fails', () => {
    render(<TvEmblem alt="Club" className="e" fallback={<span>CL</span>} src="/missing.png" />);
    fireEvent.error(screen.getByAltText('Club'));
    expect(screen.getByText('CL')).toBeDefined();
    expect(screen.queryByAltText('Club')).toBeNull();
  });
});
