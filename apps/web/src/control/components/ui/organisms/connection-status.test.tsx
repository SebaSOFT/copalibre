import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from './connection-status.js';

const labels = {
  online: 'Online',
  offline: 'Offline',
  queuedCount: (count: number) => `${count} queued action${count === 1 ? '' : 's'}`,
  refusedCount: (count: number) => `${count} refused action${count === 1 ? '' : 's'}`,
  lastSuccessfulSync: (time: string) => `Last synced ${time}`,
  neverSynced: 'Not yet synced',
};

describe('ConnectionStatus', () => {
  it('shows offline, queued count and last successful sync in amber', () => {
    const { container } = render(
      <ConnectionStatus
        labels={labels}
        lastSuccessfulSync="18:42"
        online={false}
        queuedCount={1}
        refusedCount={0}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('Offline');
    expect(screen.getByText('1 queued action').textContent).toBe('1 queued action');
    expect(screen.getByText('Last synced 18:42').textContent).toBe('Last synced 18:42');
    expect((container.firstChild as HTMLElement).getAttribute('data-tone')).toBe('amber');
  });

  it('uses red only when an action has been refused', () => {
    const { container } = render(
      <ConnectionStatus labels={labels} online={true} queuedCount={0} refusedCount={1} />,
    );

    expect((container.firstChild as HTMLElement).getAttribute('data-tone')).toBe('red');
    expect(screen.getByText('1 refused action').textContent).toBe('1 refused action');
  });

  it('keeps offline status neutral when the queue is empty', () => {
    const { container } = render(
      <ConnectionStatus labels={labels} online={false} queuedCount={0} refusedCount={0} />,
    );

    expect((container.firstChild as HTMLElement).getAttribute('data-tone')).toBe('neutral');
    expect(screen.getByText('Not yet synced').textContent).toBe('Not yet synced');
  });
});
