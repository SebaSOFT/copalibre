import { fireEvent, render, screen } from '@testing-library/react';
import { DescriptorBuilderWizard } from './components/DescriptorBuilderWizard.js';
import { withIntl } from './i18n/test-support.js';

function goToParticipantsStep(): void {
  fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'test-sport' } });
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Test Sport' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Test Author' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('the discipline builder wizard', () => {
  it('shows a persistent explanation for the alias decision, bound to the field', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    const alias = screen.getByLabelText('Alias');
    expect(alias.getAttribute('aria-describedby')).toBe('descriptor-alias-hint');
    expect(screen.getByText(/The stable identity this discipline installs under/)).toBeDefined();
  });

  it('refuses to continue past the name step without an English name', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'test-sport' } });
    const continueButton = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Test Sport' } });
    expect(continueButton.disabled).toBe(false);
  });

  it('refuses a reserved-looking submission client-side until participant types are chosen', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    goToParticipantsStep();
    expect(screen.getByText('Participants')).toBeDefined();
    const continueButton = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('team'));
    expect(continueButton.disabled).toBe(false);
  });

  it('adds and removes a segment type from the list', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    goToParticipantsStep();
    fireEvent.change(screen.getByLabelText('Segment name'), { target: { value: 'half' } });
    fireEvent.change(screen.getByLabelText('Segment label'), { target: { value: 'Half' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/half — Half/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText(/half — Half/)).toBeNull();
  });

  it('shows server-side validation failures when the parent passes them', () => {
    render(
      withIntl(
        <DescriptorBuilderWizard
          failures={[
            { stage: 'reserved-alias', field: 'alias', message: '"football" is reserved' },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId('descriptor-server-failures').textContent).toContain(
      '"football" is reserved',
    );
  });
});
