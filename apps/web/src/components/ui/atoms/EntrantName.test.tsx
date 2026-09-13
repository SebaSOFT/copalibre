import { render, screen } from '@testing-library/react';
import { EntrantName } from './EntrantName.js';

class ResizeObserverMock {
  static widths = { client: 40, scroll: 120 };
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    Object.defineProperties(target, {
      clientWidth: { configurable: true, value: ResizeObserverMock.widths.client },
      scrollWidth: { configurable: true, value: ResizeObserverMock.widths.scroll },
    });
    this.callback([], this as unknown as ResizeObserver);
  }
  disconnect(): void {}
  unobserve(): void {}
}

describe('EntrantName', () => {
  beforeEach(() => {
    ResizeObserverMock.widths = { client: 40, scroll: 120 };
    Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
  });

  it('uses the persisted abbreviation with the full name as its title when constrained', () => {
    render(<EntrantName fullName="Casa de Italia" abbreviation="CDI" />);
    expect(screen.getByTitle('Casa de Italia').textContent).toBe('CDI');
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
});
