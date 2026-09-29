/**
 * Shared chrome for `TournamentSetupWizard`/`ProfileBuilderWizard`/
 * `DescriptorBuilderWizard` (openspec 0236): the title/progress header, the
 * step-indicator list, the problems alert, an optional server-failures alert,
 * and the Back/primary-action footer. The step content itself is the
 * `children` slot — this component never knows what a step contains.
 *
 * Takes only resolved strings/callbacks, the same "props only, fetches/
 * resolves nothing" rule `Field` documents for this tier — it never imports
 * `react-intl` or a wizard's own message catalogue.
 */
import type { ReactNode } from 'react';
import { Alert } from '../atoms/alert.js';
import { Badge } from '../atoms/badge.js';
import { Button } from '../atoms/button.js';
import { Card } from '../atoms/card.js';

export interface WizardShellStep {
  readonly id: string;
  readonly label: string;
}

export interface WizardShellFailure {
  readonly key: string;
  readonly text: string;
}

export interface WizardShellPrimaryAction {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}

export interface WizardShellProps {
  readonly ariaLabel: string;
  readonly title: string;
  /**
   * `TournamentSetupWizard` renders a breadcrumb above its title; the other
   * two wizards render a bare title. Omitting this prop renders no breadcrumb.
   */
  readonly breadcrumb?: string;
  readonly progress: number;
  readonly progressTestId: string;
  /**
   * `TournamentSetupWizard`'s progress tile carries a second line ("X%
   * configured"); the other two wizards' tiles carry only the percentage.
   */
  readonly progressCaption?: string;
  readonly stepsAriaLabel: string;
  readonly steps: readonly WizardShellStep[];
  readonly currentStepId: string;
  /**
   * `TournamentSetupWizard`'s step indicator uses the owned badge atom in a
   * fixed-column grid; `ProfileBuilderWizard`/`DescriptorBuilderWizard` draw a
   * plain number in an auto-fit grid.
   */
  readonly stepIndicatorVariant: 'badge' | 'plain';
  readonly problems: readonly string[];
  readonly failures?: readonly WizardShellFailure[];
  readonly failuresTestId?: string;
  /**
   * Rendered between the failures alert and the footer — `DescriptorBuilderWizard`'s
   * only use, for its authored-document `TerminalBlock` preview (openspec 0236's
   * design.md, "Shared step-machine helper" sibling decision). Omitted by the
   * other two wizards.
   */
  readonly afterFailures?: ReactNode;
  readonly onBack: () => void;
  readonly backLabel: string;
  readonly primaryAction: WizardShellPrimaryAction;
  readonly children: ReactNode;
}

export function WizardShell({
  ariaLabel,
  title,
  breadcrumb,
  progress,
  progressTestId,
  progressCaption,
  stepsAriaLabel,
  steps,
  currentStepId,
  stepIndicatorVariant,
  problems,
  failures = [],
  failuresTestId,
  afterFailures,
  onBack,
  backLabel,
  primaryAction,
  children,
}: WizardShellProps): React.JSX.Element {
  const badge = stepIndicatorVariant === 'badge';
  const currentStepIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <section aria-label={ariaLabel} className="cl-form-screen">
      <header className="cl-form-screen__header">
        {breadcrumb === undefined ? (
          <h1 className="cl-form-screen__title">{title}</h1>
        ) : (
          <div>
            <p className="cl-form-screen__breadcrumb">{breadcrumb}</p>
            <h1 className="cl-form-screen__title">{title}</h1>
          </div>
        )}
        <div className="cl-stat-tile cl-chamfer cl-chamfer--control" data-testid={progressTestId}>
          <strong className="cl-stat-tile__value">{progress}%</strong>
          {progressCaption === undefined ? null : <span>{progressCaption}</span>}
        </div>
      </header>

      <Card
        className="cl-chamfer cl-chamfer--control"
        style={badge ? { minWidth: 0, maxWidth: '100%', overflow: 'hidden' } : undefined}
      >
        <ol
          aria-label={stepsAriaLabel}
          style={{
            display: 'grid',
            gridTemplateColumns: badge
              ? `repeat(${steps.length}, minmax(8rem, 1fr))`
              : 'repeat(auto-fit, minmax(min(100%, 6rem), 1fr))',
            gap: 'var(--cl-space-3)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            ...(badge
              ? { width: '100%', maxWidth: '100%', overflowX: 'auto', scrollbarGutter: 'stable' }
              : {}),
          }}
        >
          {steps.map((step, index) => (
            <li
              key={step.id}
              style={
                badge
                  ? {
                      display: 'grid',
                      gap: 'var(--cl-space-2)',
                      justifyItems: 'center',
                      color: 'var(--cl-text-secondary)',
                      fontFamily: 'var(--cl-font-mono)',
                      textTransform: 'uppercase',
                      fontSize: 'var(--cl-font-size-xs)',
                    }
                  : { display: 'grid', gap: 'var(--cl-space-2)', justifyItems: 'center' }
              }
            >
              {badge ? (
                <Badge
                  aria-current={step.id === currentStepId ? 'step' : undefined}
                  className={`cl-badge--${
                    step.id === currentStepId
                      ? 'live'
                      : index < currentStepIndex
                        ? 'positive'
                        : 'muted'
                  }`}
                  data-state={
                    step.id === currentStepId
                      ? 'active'
                      : index < currentStepIndex
                        ? 'completed'
                        : 'upcoming'
                  }
                  label={String(index + 1)}
                />
              ) : (
                <span aria-current={step.id === currentStepId ? 'step' : undefined}>
                  {index + 1}
                </span>
              )}
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="cl-chamfer cl-chamfer--control">
        {children}

        {problems.length > 0 && (
          <Alert block className="cl-inline-alert--spaced" tone="destructive">
            <ul id="wizard-problems">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Alert>
        )}

        {failures.length > 0 && (
          <Alert
            block
            className="cl-inline-alert--spaced"
            testId={failuresTestId}
            tone="destructive"
          >
            <ul>
              {failures.map((failure) => (
                <li key={failure.key}>{failure.text}</li>
              ))}
            </ul>
          </Alert>
        )}

        {afterFailures}

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--cl-space-3)',
            marginTop: 'var(--cl-space-6)',
          }}
        >
          <Button onClick={onBack} type="button" variant="secondary">
            {backLabel}
          </Button>
          <Button
            aria-describedby={
              primaryAction.disabled && problems.length > 0 ? 'wizard-problems' : undefined
            }
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
            type="button"
          >
            {primaryAction.label}
          </Button>
        </footer>
      </Card>
    </section>
  );
}
