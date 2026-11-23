import { act, render, screen } from '@testing-library/react';
import { EntrantName } from './EntrantName.js';

class ResizeObserverMock {
  static widths = { client: 40, scroll: 120 };
  static widthByText: ((text: string) => { client: number; scroll: number }) | undefined;
  static instances: { target: Element; callback: ResizeObserverCallback }[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    const widths = ResizeObserverMock.widthByText
      ? ResizeObserverMock.widthByText(target.textContent ?? '')
      : ResizeObserverMock.widths;
    Object.defineProperties(target, {
      clientWidth: { configurable: true, value: widths.client },
      scrollWidth: { configurable: true, value: widths.scroll },
    });
    ResizeObserverMock.instances.push({ target, callback: this.callback });
    this.callback([], this as unknown as ResizeObserver);
  }
  disconnect(): void {}
  unobserve(): void {}
}

describe('EntrantName', () => {
  it('supports inline names and consumer classes without imposing typography', () => {
    render(<EntrantName inline className="consumer" fullName="Casa de Italia" />);
    const name = screen.getByTestId('entrant-name');
    expect(name.classList.contains('cl-entrant-name--inline')).toBe(true);
    expect(name.classList.contains('consumer')).toBe(true);
    expect(name.getAttribute('style')).toBeNull();
  });

  beforeEach(() => {
    ResizeObserverMock.widths = { client: 40, scroll: 120 };
    ResizeObserverMock.widthByText = undefined;
    ResizeObserverMock.instances = [];
    Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
  });

  it('uses the persisted abbreviation with the full accessible name when constrained', () => {
    render(<EntrantName fullName="Casa de Italia" abbreviation="CDI" />);
    const name = screen.getByTestId('entrant-name');
    expect(name.textContent).toBe('CDI');
    expect(name.getAttribute('aria-label')).toBe('Casa de Italia');
    expect(name.getAttribute('title')).toBeNull();
  });

  it('keeps the full name when it fits', () => {
    ResizeObserverMock.widths = { client: 120, scroll: 40 };
    render(<EntrantName fullName="Casa de Italia" abbreviation="CDI" />);
    expect(screen.getByText('Casa de Italia').textContent).toBe('Casa de Italia');
  });

  it('does not invent a shortened label when no abbreviation is resolved', () => {
    render(<EntrantName fullName="Casa de Italia" />);
    expect(screen.getByText('Casa de Italia').textContent).toBe('Casa de Italia');
  });

  it('synchronizes compact form across separate mounts sharing syncGroup and reverts when overflow clears', () => {
    ResizeObserverMock.widthByText = (text) =>
      text.includes('Semifinal 2') ? { client: 140, scroll: 180 } : { client: 140, scroll: 120 };

    const { rerender } = render(
      <>
        <EntrantName
          pending
          syncGroup="g1"
          fullName="Ganador de Semifinal 1"
          abbreviation="G Semifinal 1"
        />
        <EntrantName
          pending
          syncGroup="g1"
          fullName="Ganador de Semifinal 2"
          abbreviation="G Semifinal 2"
        />
      </>,
    );

    const names = screen.getAllByTestId('entrant-name');
    expect(names.map((el) => el.textContent?.trim())).toEqual(['G Semifinal 1', 'G Semifinal 2']);
    expect(names.every((el) => el.querySelector('abbr') !== null)).toBe(true);

    // Re-observing at the same narrow box after switching to the shorter abbreviation must not oscillate back to long.
    act(() => {
      for (const entry of ResizeObserverMock.instances) {
        Object.defineProperties(entry.target, {
          clientWidth: { configurable: true, value: 140 },
          scrollWidth: { configurable: true, value: 90 },
        });
        entry.callback([], {} as ResizeObserver);
      }
    });
    expect(names.map((el) => el.textContent?.trim())).toEqual(['G Semifinal 1', 'G Semifinal 2']);

    // When the overflowing member later fits, both revert to the full form together.
    ResizeObserverMock.widthByText = () => ({ client: 220, scroll: 140 });
    act(() => {
      for (const entry of ResizeObserverMock.instances) {
        Object.defineProperties(entry.target, {
          clientWidth: { configurable: true, value: 220 },
          scrollWidth: { configurable: true, value: 140 },
        });
        entry.callback([], {} as ResizeObserver);
      }
    });

    expect(names.map((el) => el.textContent?.trim())).toEqual([
      'Ganador de Semifinal 1',
      'Ganador de Semifinal 2',
    ]);
    expect(names.every((el) => el.querySelector('abbr') === null)).toBe(true);

    // Dropping syncGroup cleans up membership cleanly.
    rerender(
      <>
        <EntrantName pending fullName="Ganador de Semifinal 1" abbreviation="G Semifinal 1" />
        <EntrantName pending fullName="Ganador de Semifinal 2" abbreviation="G Semifinal 2" />
      </>,
    );
  });
});
