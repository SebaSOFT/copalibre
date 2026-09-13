/**
 * Original composition — the inline alert the product has been writing by hand
 * since it first needed one (OpenSpec 0214).
 *
 * `.cl-inline-alert` has existed in the token layer all along, so 68 places
 * across 29 files type the class and decide the rest for themselves. Measured
 * before this component existed: **65 of those 68 declared no tone at all**, so
 * an error, a success confirmation and a loading message drew the same rail and
 * read identically; and 53 of them declared no `role="alert"`, so whether a
 * screen reader heard the message at all depended on which call site wrote it.
 *
 * The class name was the API. This makes the contract the API instead: a tone
 * is required, and the live-region behaviour follows from it rather than from
 * what each author remembered.
 */
import type { ReactNode } from 'react';

/**
 * What the alert means, not what colour it draws.
 *
 * `live` is kept distinct from `success` because the token layer already
 * separates them: an in-progress broadcast is not a completed action.
 */
export type AlertTone = 'info' | 'success' | 'destructive' | 'live';

export interface AlertProps {
  /** Required: an alert that does not say what it means is the defect this replaces. */
  readonly tone: AlertTone;
  readonly children: ReactNode;
  /**
   * Renders the alert stacked, with this as its emphasised first line.
   *
   * `heading` rather than `title`: `title` is an HTML attribute with entirely
   * different behaviour, and the interface-text scanner reads that attribute by
   * name — a prop sharing it would be reported as hardcoded copy on every call.
   */
  readonly heading?: string;
  /**
   * Overrides the politeness derived from `tone`. Needed only where a screen
   * knows better — a stream of frequent updates that should not interrupt, or
   * a message already announced by something else.
   */
  readonly live?: 'polite' | 'assertive' | 'off';
  /** Supplying a handler renders the dismiss control; omitting it renders none. */
  readonly onDismiss?: () => void;
  /** Required with `onDismiss`: a control with no accessible name is unusable. */
  readonly dismissLabel?: string;
  readonly className?: string;
  /** Names the alert for a test that asserts a screen's failure state. */
  readonly testId?: string;
  /**
   * Renders a `<div>` instead of a `<p>`, for content a paragraph may not
   * contain — a list of validation problems, a nested control. Explicit rather
   * than inferred: whether children are block content is not something this
   * component can see, and getting it wrong produces markup the browser
   * silently restructures.
   */
  readonly block?: boolean;
}

/**
 * A failure interrupts; everything else waits for a pause. Derived rather than
 * asked for, because the previous arrangement — every call site deciding — is
 * how 53 of 68 alerts ended up announcing nothing.
 */
const POLITENESS: Readonly<Record<AlertTone, 'polite' | 'assertive'>> = {
  info: 'polite',
  success: 'polite',
  live: 'polite',
  destructive: 'assertive',
};

export function Alert({
  tone,
  children,
  heading,
  live,
  onDismiss,
  dismissLabel,
  className = '',
  testId,
  block = false,
}: AlertProps): React.JSX.Element {
  const politeness = live ?? POLITENESS[tone];
  const classes = [
    'cl-inline-alert',
    tone === 'info' ? '' : `cl-inline-alert--${tone}`,
    heading === undefined ? '' : 'cl-inline-alert--stacked',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const dismiss =
    onDismiss === undefined ? null : (
      <button
        aria-label={dismissLabel}
        className="cl-focusable cl-inline-alert__dismiss"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    );

  /*
   * `role="status"` rather than `aria-live="polite"`.
   *
   * A bare live region only announces changes to content already in the DOM,
   * and every one of these alerts is rendered conditionally — it appears *as*
   * the change. `role="status"` and `role="alert"` are announced on insertion,
   * which is the behaviour every one of these call sites actually needs.
   */
  const role = politeness === 'off' ? undefined : politeness === 'assertive' ? 'alert' : 'status';

  /*
   * A `<p>` for a single line, a `<div>` when the alert carries structure.
   *
   * 59 of the call sites this replaces were paragraphs and 9 were not, and a
   * `<p>`'s block margin is load-bearing outside `.cl-card__content` — which is
   * why the stylesheet resets it there specifically. Rendering everything as a
   * `<div>` would silently restyle 59 screens; rendering everything as a `<p>`
   * would nest a list inside a paragraph, which is invalid and which three call
   * sites need.
   */
  if (heading === undefined && onDismiss === undefined && !block) {
    return (
      <p className={classes} data-testid={testId} role={role}>
        {children}
      </p>
    );
  }

  return (
    <div className={classes} data-testid={testId} role={role}>
      {heading === undefined ? (
        children
      ) : (
        <>
          <p className="cl-inline-alert__title">{heading}</p>
          <div className="cl-inline-alert__body">{children}</div>
        </>
      )}
      {dismiss}
    </div>
  );
}
