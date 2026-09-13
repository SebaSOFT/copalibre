/**
 * Original composition — Card atom + Badge atom + a metadata/actions
 * layout for showing one entity (an organization, an installed module, a
 * participant) consistently across screens.
 */
import type { MouseEvent, ReactNode } from 'react';
import type { SemanticColor } from '@copalibre/design-tokens';
import { Badge } from '../atoms/badge.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../atoms/card.js';

export interface DataEntityCardBadge {
  readonly label: string;
  readonly state: SemanticColor;
  /** Names the badge for a test that asserts an entity's state by word. */
  readonly testId?: string;
}

export interface DataEntityCardMetadataItem {
  readonly label: string;
  readonly value: string;
  /**
   * Renders the value as a figure — mono and tabular, like every other number
   * in Control-web — rather than as prose.
   */
  readonly numeric?: boolean;
}

/**
 * The lifecycle tone a card carries.
 *
 * A closed set rather than a class string: a call site that can pass any class
 * is a call site that styles a card off-token, which is the drift this library
 * exists to prevent.
 */
export type DataEntityCardAccent = 'live' | 'upcoming' | 'muted' | 'positive';

export interface DataEntityCardProps {
  readonly title: string;
  readonly badge?: DataEntityCardBadge;
  readonly metadata?: readonly DataEntityCardMetadataItem[];
  readonly actions?: ReactNode;
  readonly accent?: DataEntityCardAccent;
  /** Makes the title a link to the entity's own screen. */
  readonly titleHref?: string;
  /** Client-side navigation for `titleHref`; the href stays the real target. */
  readonly onTitleNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function DataEntityCard({
  title,
  badge,
  metadata = [],
  actions,
  accent,
  titleHref,
  onTitleNavigate,
}: DataEntityCardProps): React.JSX.Element {
  return (
    <Card className={accent === undefined ? '' : `cl-state--${accent}`}>
      <CardHeader className="cl-data-entity-card__header">
        <CardTitle>
          {titleHref === undefined ? (
            title
          ) : (
            <a className="cl-focusable" href={titleHref} onClick={onTitleNavigate}>
              {title}
            </a>
          )}
        </CardTitle>
        {badge ? (
          <Badge
            data-testid={badge.testId}
            label={badge.label}
            style={{ color: `var(--cl-${badge.state})` }}
          />
        ) : null}
      </CardHeader>
      {metadata.length > 0 ? (
        <CardContent className="cl-data-entity-card__metadata">
          {metadata.map((item) => (
            <div className="cl-data-entity-card__metadata-item" key={item.label}>
              <span className="cl-data-entity-card__metadata-label">{item.label}</span>
              <span className={item.numeric ? 'cl-data-entity-card__metadata-figure' : undefined}>
                {item.value}
              </span>
            </div>
          ))}
        </CardContent>
      ) : null}
      {actions ? <CardFooter>{actions}</CardFooter> : null}
    </Card>
  );
}
