import { render, screen } from '@testing-library/react';
import { ResponsivePlayerName } from './ResponsivePlayerName.js';

class ResizeObserverMock {
  static width = 300;
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    Object.defineProperties(target, {
      clientWidth: { configurable: true, value: ResizeObserverMock.width },
    });
    this.callback([], this as unknown as ResizeObserver);
  }
  disconnect(): void {}
  unobserve(): void {}
}

describe('ResponsivePlayerName', () => {
  beforeEach(() => {
    ResizeObserverMock.width = 300;
    Object.assign(globalThis, { ResizeObserver: ResizeObserverMock });
  });

  it('renders flag, first, and last name at full width', () => {
    ResizeObserverMock.width = 260;
    render(<ResponsivePlayerName fullName="Sebastian Dieguez" nationalityCode="AR" />);
    const el = screen.getByTestId('responsive-player-name');
    expect(el.textContent).toBe('🇦🇷 Sebastian Dieguez');
  });

  it('renders first and last name at medium width, with no flag', () => {
    ResizeObserverMock.width = 180;
    render(<ResponsivePlayerName fullName="Sebastian Dieguez" nationalityCode="AR" />);
    expect(screen.getByTestId('responsive-player-name').textContent).toBe('Sebastian Dieguez');
  });

  it('renders "F. Last" at compact width', () => {
    ResizeObserverMock.width = 100;
    render(<ResponsivePlayerName fullName="Sebastian Dieguez" />);
    expect(screen.getByTestId('responsive-player-name').textContent).toBe('S. Dieguez');
  });

  it('renders "F. L." at minimal width', () => {
    ResizeObserverMock.width = 50;
    render(<ResponsivePlayerName fullName="Sebastian Dieguez" />);
    expect(screen.getByTestId('responsive-player-name').textContent).toBe('S. D.');
  });

  it('prefers discrete firstName/lastName over parsing fullName', () => {
    render(<ResponsivePlayerName firstName="Diego" lastName="De la Cruz" />);
    expect(screen.getByTestId('responsive-player-name').textContent).toBe('Diego De la Cruz');
  });

  it('renders no flag and no layout gap when nationality is absent', () => {
    ResizeObserverMock.width = 260;
    render(<ResponsivePlayerName fullName="Sebastian Dieguez" />);
    expect(screen.getByTestId('responsive-player-name').textContent).toBe('Sebastian Dieguez');
  });

  it('preserves full name and nationality in title and aria-label at every tier', () => {
    ResizeObserverMock.width = 50;
    render(<ResponsivePlayerName fullName="Sebastian Dieguez" nationalityCode="AR" />);
    const el = screen.getByTestId('responsive-player-name');
    expect(el.getAttribute('title')).toBe('Sebastian Dieguez');
    expect(el.getAttribute('aria-label')).toBe('Sebastian Dieguez, AR');
  });
});
