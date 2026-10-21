import { render, screen } from '@testing-library/react';
import { Icon } from './icon.js';
import { ICON_REGISTRY } from '../../../../lib/icon-registry.js';

describe('Icon atom', () => {
  it('renders every registry key at each supported size', () => {
    for (const name of Object.keys(ICON_REGISTRY)) {
      for (const size of [16, 20, 24] as const) {
        const { container, unmount } = render(<Icon name={name} size={size} />);
        const svg = container.querySelector('svg');
        expect(svg?.getAttribute('width')).toBe(String(size));
        expect(svg?.getAttribute('height')).toBe(String(size));
        unmount();
      }
    }
  });

  it('adds optical scaling to every Tabler entry', () => {
    for (const name of Object.keys(ICON_REGISTRY).filter(
      (key) => ICON_REGISTRY[key as keyof typeof ICON_REGISTRY].set === 'tabler',
    )) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg')?.classList.contains('cl-icon--tabler')).toBe(true);
      unmount();
    }
  });

  it('hides decorative SVGs from assistive technology', () => {
    const { container } = render(<Icon name="clock" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('requires a label for a meaningful icon in development', () => {
    expect(() => render(<Icon name="retry" decorative={false} />)).toThrow(/accessible label/);
    render(<Icon name="retry" decorative={false} label="Retry" />);
    expect(screen.getByRole('img', { name: 'Retry' })).toBeDefined();
  });

  it('resolves unknown runtime names to the custom neutral glyph', () => {
    const { container } = render(<Icon name="not-registered" />);
    expect(container.querySelectorAll('path')).toHaveLength(1);
  });
});
