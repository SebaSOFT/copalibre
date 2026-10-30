import type { ReactNode } from 'react';
import { Button } from '../atoms/button.js';
import { Icon } from '../atoms/icon.js';
import { LinkButton } from '../atoms/link-button.js';

export interface EmptyStateAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly href?: string;
}

type EmptyStatePermission =
  | {
      readonly reason?: 'action-required';
      readonly action: EmptyStateAction;
      readonly whoCanAct?: never;
    }
  | { readonly reason: 'no-permission'; readonly action?: never; readonly whoCanAct: ReactNode }
  | { readonly reason: 'informational'; readonly action?: never; readonly whoCanAct?: never };

export type EmptyStateProps = EmptyStatePermission & {
  readonly icon: string;
  readonly heading: string;
  readonly description: ReactNode;
  readonly className?: string;
  readonly headingLevel?: 2 | 3;
  readonly children?: ReactNode;
};

/** A successful empty result that names the next useful action. */
export function EmptyState(props: EmptyStateProps): React.JSX.Element {
  const Heading = props.headingLevel === 3 ? 'h3' : 'h2';
  if (props.reason !== 'no-permission' && props.reason !== 'informational' && !props.action) {
    throw new Error(
      'EmptyState requires an action unless reason is informational or no-permission.',
    );
  }

  return (
    <section className={`cl-interaction-empty-state ${props.className ?? ''}`.trim()}>
      <div aria-hidden="true" className="cl-interaction-empty-state__icon-well">
        <Icon name={props.icon} />
      </div>
      <Heading className="cl-interaction-empty-state__heading">{props.heading}</Heading>
      <p className="cl-interaction-empty-state__description">{props.description}</p>
      {props.children}
      {props.reason === 'no-permission' ? (
        <p className="cl-interaction-empty-state__permission">{props.whoCanAct}</p>
      ) : props.reason === 'informational' ? null : props.action.href ? (
        <LinkButton
          href={props.action.href}
          onClick={(event) => {
            event.preventDefault();
            props.action.onClick();
          }}
        >
          {props.action.label}
        </LinkButton>
      ) : (
        <Button onClick={props.action.onClick} variant="primary">
          {props.action.label}
        </Button>
      )}
    </section>
  );
}
