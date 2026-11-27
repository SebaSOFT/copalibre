import { render, screen } from '@testing-library/react';
import { EventSyncMark, type EventSyncState } from './event-sync-mark.js';

const labels: Readonly<Record<EventSyncState, string>> = {
  queued: 'Queued',
  sent: 'Sent',
  confirmed: 'Confirmed',
  refused: 'Refused',
};

describe('EventSyncMark', () => {
  it.each([
    ['queued', false, 'Queued'],
    ['sent', false, 'Sent'],
    ['confirmed', true, 'Confirmed'],
    ['refused', false, 'Refused'],
  ] as const)('renders %s queue state', (state, acknowledged, expected) => {
    render(<EventSyncMark acknowledged={acknowledged} labels={labels} state={state} />);
    expect(screen.getByText(expected).textContent).toBe(expected);
  });

  it('never renders confirmed without an acknowledgement', () => {
    const { container } = render(
      <EventSyncMark acknowledged={false} labels={labels} state="confirmed" />,
    );

    expect((container.firstChild as HTMLElement).getAttribute('data-state')).toBe('sent');
    expect(screen.getByText('Sent').textContent).toBe('Sent');
  });

  it('announces a refusal and its reason as an alert', () => {
    render(
      <EventSyncMark
        acknowledged={false}
        labels={labels}
        refusalReason="The event was rejected."
        state="refused"
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('The event was rejected.');
  });
});
