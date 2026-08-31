import { act, fireEvent, render, screen, within } from '@testing-library/react';
// Dedicated notification-suite signal for CI's `toast|notification` path filter.
import { jest } from '@jest/globals';
import { IntlProvider } from 'react-intl';
import { ToastProvider, useToast } from './ToastProvider.js';
import { ControlApiError } from '../lib/api-client.js';

function Fixture(): React.JSX.Element {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.push({ severity: 'success', message: 'Saved one' })}>
        First
      </button>
      <button onClick={() => toast.push({ severity: 'info', message: 'Saved two' })}>Second</button>
      <button onClick={() => toast.push({ severity: 'error', message: 'Persistent error' })}>
        Error
      </button>
      <button
        onClick={() => toast.pushError(new ControlApiError(409, 'Raw detail', 'unmapped-code'))}
      >
        Unmapped
      </button>
    </div>
  );
}

function renderFixture(): ReturnType<typeof render> {
  return render(
    <IntlProvider locale="en">
      <ToastProvider>
        <Fixture />
      </ToastProvider>
    </IntlProvider>,
  );
}

describe('ToastProvider', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stacks newest first and dismisses each message independently', () => {
    renderFixture();
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(
      within(region)
        .getAllByRole('status')
        .map((node) => node.textContent),
    ).toEqual(['i InformationSaved two×', '✓ SuccessSaved one×']);

    fireEvent.click(within(region).getAllByRole('button', { name: 'Dismiss notification' })[0]);
    act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByText('Saved two')).toBeNull();
    expect(screen.getByText('Saved one')).toBeTruthy();
  });

  it('auto-dismisses success and info independently', () => {
    renderFixture();
    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    act(() => jest.advanceTimersByTime(1_000));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    act(() => jest.advanceTimersByTime(4_200));
    expect(screen.queryByText('Saved one')).toBeNull();
    expect(screen.getByText('Saved two')).toBeTruthy();

    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.queryByText('Saved two')).toBeNull();
  });

  it('does not auto-dismiss errors', () => {
    renderFixture();
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    act(() => jest.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert').textContent).toContain('Persistent error');
  });

  it('keeps unmapped raw data collapsed behind technical details', () => {
    renderFixture();
    fireEvent.click(screen.getByRole('button', { name: 'Unmapped' }));
    const details = screen.getByText('Technical details').closest('details');
    expect(screen.getByText('The request could not be completed. Try again.')).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(within(details as HTMLElement).getByText('unmapped-code')).toBeTruthy();
    expect(within(details as HTMLElement).getByText('Raw detail')).toBeTruthy();
  });

  it('uses motion tokens and collapses transitions for reduced motion', () => {
    const { container } = renderFixture();
    const css = container.parentElement?.querySelector('style')?.textContent ?? '';
    expect(css).toContain('var(--cl-motion-base)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition-duration: 0s');
  });
});
