/**
 * Generating a stage ahead of its prior stage, from the promotion plans routing to it.
 *
 * The preview is the bracket itself with each first-round side named by its qualifier
 * position, so the organizer sees the cross-overs the plan decides before anything is
 * written. Generating is one explicit action; confirming who qualified happens later, on
 * its own screen, once the prior stage completes.
 */
import { useState, type ReactNode } from 'react';
import { Alert } from '../atoms/alert.js';
import { Button } from '../atoms/button.js';
import { Card } from '../atoms/card.js';
import { controlLinkClick } from '../../../lib/control-navigation.js';

export interface GenerateAheadPanelProps {
  readonly title: string;
  readonly description: string;
  readonly previewHeading: string;
  readonly generateLabel: string;
  /** The bracket preview, drawn by the screen that owns the canvas. */
  readonly children: ReactNode;
  /** The stage's bracket already names qualifiers: generating again would rebuild it. */
  readonly generated: boolean;
  readonly generatedMessage: string;
  readonly confirmLabel: string;
  readonly confirmHref?: string;
  readonly disabled?: boolean;
  readonly onGenerate?: () => Promise<void> | void;
}

export function GenerateAheadPanel({
  title,
  description,
  previewHeading,
  generateLabel,
  children,
  generated,
  generatedMessage,
  confirmLabel,
  confirmHref,
  disabled = false,
  onGenerate,
}: GenerateAheadPanelProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  return (
    <Card aria-label={title} className="cl-chamfer cl-chamfer--control" data-generate-ahead="">
      <header className="cl-card__header">
        <h2 className="cl-card__title">{title}</h2>
        <p className="cl-card__description">{description}</p>
      </header>
      <div className="cl-card__content">
        {generated && (
          <Alert tone="info">
            {generatedMessage}{' '}
            {confirmHref !== undefined && (
              <a
                className="cl-focusable"
                href={confirmHref}
                onClick={controlLinkClick(confirmHref)}
              >
                {confirmLabel}
              </a>
            )}
          </Alert>
        )}
        <h3>{previewHeading}</h3>
        {children}
        <Button
          disabled={disabled || busy}
          onClick={() => {
            setBusy(true);
            void Promise.resolve(onGenerate?.()).finally(() => setBusy(false));
          }}
          type="button"
        >
          {generateLabel}
        </Button>
      </div>
    </Card>
  );
}
