/**
 * The editorial card: a piece of writing given a card's shape.
 *
 * Composed entirely from owners — `Card` for the frame, `Badge` for the
 * eyebrow, `CalloutBanner` for the one thing the reader is meant to do next —
 * so it inherits their surface levels, chamfers and states rather than
 * declaring a parallel set that would drift from them.
 *
 * It is a presentation, not a feature. Nothing here fetches a changelog, stores
 * an announcement or knows what a release is: a surface that has something
 * editorial to say passes it in, and a surface that has nothing renders none.
 * That is the whole reason this change adds no release-management subsystem —
 * the application had no release listing, and a composition is not a reason to
 * invent one.
 */
import type { ReactNode } from 'react';
import { Badge } from '../atoms/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../atoms/card.js';
import { CalloutBanner } from './callout-banner.js';

export interface EditorialCardProps {
  /** A short chrome label above the title — a category, a module, a section. */
  readonly eyebrow?: string;
  readonly title: string;
  /**
   * A real timestamp or version line, already formatted by the caller. Absent
   * where the surface has none; never a placeholder date.
   */
  readonly dateline?: ReactNode;
  readonly children?: ReactNode;
  /**
   * The next step, where there is one. Its destination must be a route the
   * application actually serves — a dead link in an editorial card is the
   * failure this composition is most likely to introduce.
   */
  readonly callout?: {
    readonly title: string;
    readonly description: ReactNode;
    readonly actionLabel?: string;
    readonly actionHref?: string;
    readonly onAction?: () => void;
  };
  /** `inverse` where the card is the section rather than one entry in it. */
  readonly variant?: 'default' | 'inverse';
  readonly className?: string;
}

export function EditorialCard({
  eyebrow,
  title,
  dateline,
  children,
  callout,
  variant = 'default',
  className = '',
}: EditorialCardProps): React.JSX.Element {
  return (
    <Card className={`cl-editorial-card ${className}`.trim()} variant={variant}>
      <CardHeader>
        {eyebrow !== undefined && <Badge label={eyebrow} variant="eyebrow" />}
        <CardTitle>{title}</CardTitle>
        {dateline !== undefined && <p className="cl-metric-strip__label">{dateline}</p>}
      </CardHeader>
      <CardContent>
        {children}
        {callout !== undefined && (
          <CalloutBanner
            description={callout.description}
            title={callout.title}
            {...(callout.actionLabel === undefined ? {} : { actionLabel: callout.actionLabel })}
            {...(callout.actionHref === undefined ? {} : { actionHref: callout.actionHref })}
            {...(callout.onAction === undefined ? {} : { onAction: callout.onAction })}
          />
        )}
      </CardContent>
    </Card>
  );
}
