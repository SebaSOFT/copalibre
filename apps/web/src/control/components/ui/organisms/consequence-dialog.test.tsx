import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { IntlProvider } from 'react-intl';
import { ConsequenceDialog } from './consequence-dialog.js';

function renderDialog(onConfirm = jest.fn()) {
  return render(
    <IntlProvider locale="en">
      <ConsequenceDialog
        cancelLabel="Cancel"
        closeLabel="Close"
        confirmLabel="Delete schedule"
        counts={[
          { label: 'slots deleted', value: 4333 },
          { label: 'matches unassigned', value: 36 },
        ]}
        description="This removes the schedule and its placements."
        onConfirm={onConfirm}
        onOpenChange={() => undefined}
        open
        title="Delete schedule?"
        typeToConfirm="Fixture schedule"
        typeToConfirmLabel="Type the schedule name to confirm"
      />
    </IntlProvider>,
  );
}

describe('ConsequenceDialog', () => {
  it('renders dry-run counts and keeps confirm disabled until the object name matches', () => {
    renderDialog();

    expect(screen.getByText('4,333')).toBeDefined();
    expect(screen.getByText('slots deleted')).toBeDefined();
    expect(screen.getByText('36')).toBeDefined();
    expect(screen.getByText('Fixture schedule')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Delete schedule' })).toHaveProperty(
      'disabled',
      true,
    );

    fireEvent.change(screen.getByLabelText('Type the schedule name to confirm'), {
      target: { value: 'Fixture schedule' },
    });

    expect(screen.getByRole('button', { name: 'Delete schedule' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('runs the named action after typed confirmation', () => {
    const onConfirm = jest.fn();
    renderDialog(onConfirm);
    fireEvent.change(screen.getByLabelText('Type the schedule name to confirm'), {
      target: { value: 'Fixture schedule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete schedule' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
