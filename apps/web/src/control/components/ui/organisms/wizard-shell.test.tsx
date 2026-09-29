import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { WizardShell, type WizardShellProps } from './wizard-shell.js';

const steps: WizardShellProps['steps'] = [
  { id: 'name', label: 'Name' },
  { id: 'rules', label: 'Rules' },
];

function baseProps(overrides: Partial<WizardShellProps> = {}): WizardShellProps {
  return {
    ariaLabel: 'Wizard',
    title: 'Set up a wizard',
    progress: 50,
    progressTestId: 'wizard-progress',
    stepsAriaLabel: 'Steps',
    steps,
    currentStepId: 'rules',
    stepIndicatorVariant: 'plain',
    problems: [],
    onBack: jest.fn(),
    backLabel: 'Back',
    primaryAction: { label: 'Continue', disabled: false, onClick: jest.fn() },
    children: <p>Step content</p>,
    ...overrides,
  };
}

describe('WizardShell', () => {
  it('renders the title, progress tile and children', () => {
    render(<WizardShell {...baseProps()} />);
    expect(screen.getByText('Set up a wizard')).toBeDefined();
    expect(screen.getByTestId('wizard-progress').textContent).toContain('50%');
    expect(screen.getByText('Step content')).toBeDefined();
  });

  it('marks the current step with aria-current="step"', () => {
    render(<WizardShell {...baseProps()} />);
    const current = screen.getByText('Rules').closest('li')?.querySelector('[aria-current]');
    expect(current?.getAttribute('aria-current')).toBe('step');
    const other = screen.getByText('Name').closest('li')?.querySelector('[aria-current]');
    expect(other).toBeNull();
  });

  it('uses the owned badge atom shape for active, completed and upcoming steps', () => {
    const { container } = render(
      <WizardShell
        {...baseProps({
          stepIndicatorVariant: 'badge',
          currentStepId: 'rules',
          steps: [...steps, { id: 'summary', label: 'Summary' }],
        })}
      />,
    );
    const badges = container.querySelectorAll('.cl-badge');

    expect(badges).toHaveLength(3);
    expect(badges[0]?.getAttribute('data-state')).toBe('completed');
    expect(badges[0]?.classList.contains('cl-badge--positive')).toBe(true);
    expect(badges[1]?.getAttribute('data-state')).toBe('active');
    expect(badges[1]?.classList.contains('cl-badge--live')).toBe(true);
    expect(badges[1]?.getAttribute('aria-current')).toBe('step');
    expect(badges[2]?.getAttribute('data-state')).toBe('upcoming');
    expect(badges[2]?.classList.contains('cl-badge--muted')).toBe(true);
  });

  it('renders no breadcrumb or progress caption by default', () => {
    render(<WizardShell {...baseProps()} />);
    expect(document.querySelector('.cl-form-screen__breadcrumb')).toBeNull();
  });

  it('renders the breadcrumb and progress caption when provided', () => {
    render(<WizardShell {...baseProps({ breadcrumb: 'Home', progressCaption: 'configured' })} />);
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('configured')).toBeDefined();
  });

  it('renders the problems alert only when problems are present', () => {
    const { rerender } = render(<WizardShell {...baseProps()} />);
    expect(screen.queryByRole('alert')).toBeNull();

    rerender(<WizardShell {...baseProps({ problems: ['Missing name'] })} />);
    expect(screen.getByRole('alert').textContent).toContain('Missing name');
  });

  it('renders the failures alert with its testid only when failures are present and non-empty', () => {
    const { rerender } = render(<WizardShell {...baseProps()} />);
    expect(screen.queryByTestId('server-failures')).toBeNull();

    rerender(
      <WizardShell
        {...baseProps({
          failures: [{ key: 'a', text: 'Server rejected it' }],
          failuresTestId: 'server-failures',
        })}
      />,
    );
    const failuresAlert = screen.getByTestId('server-failures');
    expect(failuresAlert.textContent).toContain('Server rejected it');
  });

  it('renders afterFailures between the failures alert and the footer', () => {
    render(
      <WizardShell
        {...baseProps({
          failures: [{ key: 'a', text: 'Server rejected it' }],
          failuresTestId: 'server-failures',
          afterFailures: <div data-testid="terminal-preview">preview</div>,
        })}
      />,
    );
    const failuresAlert = screen.getByTestId('server-failures');
    const preview = screen.getByTestId('terminal-preview');
    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(
      failuresAlert.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      preview.compareDocumentPosition(backButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the footer with Back on the left and the primary action on the right', () => {
    const onBack = jest.fn();
    const onPrimary = jest.fn();
    render(
      <WizardShell
        {...baseProps({
          onBack,
          primaryAction: { label: 'Create', disabled: false, onClick: onPrimary },
        })}
      />,
    );
    const backButton = screen.getByRole('button', { name: 'Back' });
    const primaryButton = screen.getByRole('button', { name: 'Create' });
    backButton.click();
    expect(onBack).toHaveBeenCalled();
    primaryButton.click();
    expect(onPrimary).toHaveBeenCalled();
    expect(
      backButton.compareDocumentPosition(primaryButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('disables the primary action button when told to', () => {
    render(
      <WizardShell
        {...baseProps({ primaryAction: { label: 'Create', disabled: true, onClick: jest.fn() } })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Create' }).hasAttribute('disabled')).toBe(true);
  });

  it('associates a disabled primary action with the visible step problems', () => {
    render(
      <WizardShell
        {...baseProps({
          problems: ['The name is missing'],
          primaryAction: { label: 'Continue', disabled: true, onClick: jest.fn() },
        })}
      />,
    );
    const button = screen.getByRole('button', { name: 'Continue' });
    const descriptionId = button.getAttribute('aria-describedby');

    expect(descriptionId).toBe('wizard-problems');
    expect(document.getElementById(descriptionId ?? '')?.textContent).toContain(
      'The name is missing',
    );
  });
});
