import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '../../../i18n/test-support.js';
import { ReadState } from './read-state.js';

describe('ReadState', () => {
  it.each(['loading', 'failed-empty'] as const)(
    'keeps the heading and skeleton during %s, without claiming an empty result',
    (status) => {
      const { container } = render(
        withIntl(
          <ReadState status={status} title="Standings" retry={() => {}}>
            No standings
          </ReadState>,
        ),
      );
      expect(screen.getByRole('heading', { name: 'Standings' })).toBeDefined();
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(screen.queryByText('No standings')).toBeNull();
    },
  );
  it.each(['ready', 'empty'] as const)(
    'renders a successful %s result without a stale mark',
    (status) => {
      const { container } = render(
        withIntl(
          <ReadState status={status} title="Standings" retry={() => {}}>
            Loaded result
          </ReadState>,
        ),
      );
      expect(screen.getByText('Loaded result')).toBeDefined();
      expect(container.querySelector('.cl-stale-mark')).toBeNull();
    },
  );
  it('keeps data and escalates a stale result after five minutes with a retry action', () => {
    jest.useFakeTimers();
    try {
      const retry = jest.fn();
      render(
        withIntl(
          <ReadState status="stale" staleSince={Date.now()} title="Standings" retry={retry}>
            Club Andes
          </ReadState>,
        ),
      );
      expect(screen.getByText('Club Andes')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      act(() => jest.advanceTimersByTime(300_000));
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retry).toHaveBeenCalledTimes(1);
      expect(screen.getByText('5 minutes ago')).toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
