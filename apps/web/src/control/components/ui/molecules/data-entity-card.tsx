/**
 * Original composition (0141) — Card atom + Badge atom + a metadata/actions
 * layout for showing one entity (an organization, an installed module, a
 * participant) consistently across screens.
 */
import type { ReactNode } from 'react';
import type { SemanticColor } from '@copalibre/design-tokens';
import { Badge } from '../atoms/badge.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../atoms/card.js';

export interface DataEntityCardBadge {
  readonly label: string;
  readonly state: SemanticColor;
}

export interface DataEntityCardMetadataItem {
  readonly label: string;
  readonly value: string;
}

export interface DataEntityCardProps {
  readonly title: string;
  readonly badge?: DataEntityCardBadge;
  readonly metadata?: readonly DataEntityCardMetadataItem[];
  readonly actions?: ReactNode;
}

export function DataEntityCard({
  title,
  badge,
  metadata = [],
  actions,
}: DataEntityCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="cl-data-entity-card__header">
        <CardTitle>{title}</CardTitle>
        {badge ? <Badge label={badge.label} style={{ color: `var(--cl-${badge.state})` }} /> : null}
      </CardHeader>
      {metadata.length > 0 ? (
        <CardContent className="cl-data-entity-card__metadata">
          {metadata.map((item) => (
            <div className="cl-data-entity-card__metadata-item" key={item.label}>
              <span className="cl-data-entity-card__metadata-label">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </CardContent>
      ) : null}
      {actions ? <CardFooter>{actions}</CardFooter> : null}
    </Card>
  );
}
