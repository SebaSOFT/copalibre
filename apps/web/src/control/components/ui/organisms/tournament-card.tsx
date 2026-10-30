import type { SemanticColor } from '@copalibre/design-tokens';
import type { ReactNode } from 'react';
import { Badge } from '../atoms/badge.js';
import { Button } from '../atoms/button.js';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../atoms/card.js';
import { LinkButton } from '../atoms/link-button.js';

export interface TournamentCardField {
  readonly key: string;
  readonly label: string;
  readonly value: ReactNode | null | undefined;
  readonly sourceField: string;
}

export interface TournamentCardRegistration {
  readonly registered: number | null | undefined;
  readonly registeredSourceField: string;
  readonly capacity: number | null | undefined;
  readonly capacitySourceField: string;
  readonly label: string;
}

export type TournamentCardAction =
  | {
      readonly label: string;
      readonly href: string;
      readonly onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    }
  | { readonly label: string; readonly onClick: () => void; readonly href?: never };

export interface TournamentCardProps {
  readonly name: string;
  readonly titleAction?: {
    readonly href: string;
    readonly onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  };
  readonly status?: {
    readonly label: string;
    readonly color: SemanticColor;
    readonly testId?: string;
  };
  readonly metadata: readonly TournamentCardField[];
  readonly registration?: TournamentCardRegistration;
  readonly facts: readonly TournamentCardField[];
  readonly action: TournamentCardAction;
  readonly secondaryActions?: ReactNode;
}

function hasValue(field: TournamentCardField): boolean {
  return field.value !== undefined && field.value !== null;
}

function PrimaryAction({ action }: { readonly action: TournamentCardAction }): React.JSX.Element {
  if ('href' in action && action.href !== undefined) {
    return (
      <LinkButton href={action.href} onClick={action.onClick} variant="primary">
        {action.label}
      </LinkButton>
    );
  }

  return (
    <Button onClick={action.onClick} type="button" variant="primary">
      {action.label}
    </Button>
  );
}

/** A data-driven tournament summary with a single lifecycle-appropriate action. */
export function TournamentCard({
  name,
  titleAction,
  status,
  metadata,
  registration,
  facts,
  action,
  secondaryActions,
}: TournamentCardProps): React.JSX.Element {
  const visibleMetadata = metadata.filter(hasValue).slice(0, 3);
  const visibleFacts = facts.filter(hasValue).slice(0, 3);
  const hasRegistration =
    registration !== undefined &&
    registration.registered !== null &&
    registration.registered !== undefined &&
    registration.capacity !== null &&
    registration.capacity !== undefined;

  return (
    <Card aria-label={name} className="cl-tournament-card">
      <CardHeader className="cl-tournament-card__header">
        <CardTitle className="cl-tournament-card__title" level={3}>
          {titleAction ? (
            <LinkButton
              className="cl-tournament-card__title-link"
              href={titleAction.href}
              onClick={titleAction.onClick}
              variant="secondary"
            >
              {name}
            </LinkButton>
          ) : (
            name
          )}
        </CardTitle>
        {status && (
          <Badge
            data-testid={status.testId}
            label={status.label}
            style={{ color: `var(--cl-${status.color})` }}
          />
        )}
      </CardHeader>
      {visibleMetadata.length > 0 && (
        <CardContent className="cl-tournament-card__metadata">
          {visibleMetadata.map((field) => (
            <span
              className="cl-tournament-card__metadata-item"
              data-source-field={field.sourceField}
              key={field.key}
            >
              <span className="cl-tournament-card__metadata-label">{field.label}</span>
              <span>{field.value}</span>
            </span>
          ))}
        </CardContent>
      )}
      {hasRegistration && registration.capacity > 0 && (
        <CardContent className="cl-tournament-card__registration">
          <progress
            aria-label={registration.label}
            className="cl-tournament-card__progress"
            data-capacity-source-field={registration.capacitySourceField}
            data-registered-source-field={registration.registeredSourceField}
            max={registration.capacity}
            value={Math.max(0, Math.min(registration.registered, registration.capacity))}
          />
          <span>{registration.label}</span>
        </CardContent>
      )}
      {visibleFacts.length > 0 && (
        <CardContent className="cl-tournament-card__facts">
          {visibleFacts.map((field) => (
            <div
              className="cl-tournament-card__fact"
              data-source-field={field.sourceField}
              key={field.key}
            >
              <span className="cl-tournament-card__fact-label">{field.label}</span>
              <span className="cl-tournament-card__fact-value">{field.value}</span>
            </div>
          ))}
        </CardContent>
      )}
      <CardFooter className="cl-tournament-card__actions">
        <PrimaryAction action={action} />
        {secondaryActions}
      </CardFooter>
    </Card>
  );
}
