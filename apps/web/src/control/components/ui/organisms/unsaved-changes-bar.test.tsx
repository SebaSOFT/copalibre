import { render, screen } from '@testing-library/react';
import { withIntl } from '../../../i18n/test-support.js';
import { UnsavedChangesBar } from './unsaved-changes-bar.js';

const baseProps = {
  summary: 'Unsaved changes',
  fieldsLabel: 'Changed fields',
  changedFields: [
    { id: 'tournament-name', label: 'Tournament name' },
    { id: 'registration-capacity', label: 'Registration capacity' },
  ],
  resetLabel: 'Discard changes',
  saveLabel: 'Save changes',
  onReset: () => undefined,
  onSave: () => undefined,
};

describe('UnsavedChangesBar', () => {
  it('stays hidden when the form is clean', () => {
    render(withIntl(<UnsavedChangesBar dirty={false} {...baseProps} />));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Tournament name')).toBeNull();
  });

  it('shows the changed fields and recovery actions when dirty', () => {
    render(withIntl(<UnsavedChangesBar dirty {...baseProps} />));

    expect(screen.getByRole('status', { name: 'Unsaved changes' })).toBeDefined();
    expect(screen.getByRole('list', { name: 'Changed fields' }).textContent).toContain(
      'Tournament name',
    );
    expect(screen.getByText('Registration capacity')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDefined();
  });
});
