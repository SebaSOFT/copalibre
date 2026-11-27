import { FormattedMessage, type MessageDescriptor, useIntl } from 'react-intl';
import type { SemanticColor } from '@copalibre/design-tokens';
import { EntrantEmblem } from '../../../../components/ui/molecules/EntrantEmblem.js';
import { Badge } from '../atoms/badge.js';
import { LinkButton } from '../atoms/link-button.js';
import { messages } from '../../../i18n/messages.en.js';

export interface ContextRailHeaderProps {
  readonly scope: 'organization' | 'tournament';
  readonly name?: string;
  readonly monogram?: string;
  readonly emblemSrc?: string;
  readonly metadata?: string;
  readonly status?: {
    readonly label: MessageDescriptor;
    readonly color: SemanticColor;
  };
  readonly primaryAction?: {
    readonly label: MessageDescriptor;
    readonly href: string;
  };
  readonly onActionClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function ContextRailHeader({
  scope,
  name,
  monogram,
  emblemSrc,
  metadata,
  status,
  primaryAction,
  onActionClick,
}: ContextRailHeaderProps): React.JSX.Element {
  const intl = useIntl();
  const scopeLabel =
    scope === 'organization'
      ? messages.pageHeaderOrganizationFallback
      : messages.pageHeaderTournamentFallback;

  return (
    <section className="cl-context-rail-header" data-scope={scope}>
      <div className="cl-context-rail-header__identity">
        <EntrantEmblem
          abbreviation={monogram}
          alt=""
          control
          decorative
          size={36}
          src={emblemSrc}
        />
        <div className="cl-context-rail-header__copy">
          <p className="cl-context-rail-header__scope">
            <FormattedMessage {...scopeLabel} />
          </p>
          {name && <p className="cl-context-rail-header__name">{name}</p>}
          {metadata && <p className="cl-context-rail-header__metadata">{metadata}</p>}
        </div>
      </div>
      {status && (
        <Badge
          className="cl-context-rail-header__status"
          dot={status.color === 'state-live'}
          label={intl.formatMessage(status.label)}
          style={{ color: `var(--cl-${status.color})` }}
        />
      )}
      {primaryAction && (
        <LinkButton
          className="cl-context-rail-header__action"
          href={primaryAction.href}
          onClick={onActionClick}
          variant="primary"
        >
          <FormattedMessage {...primaryAction.label} />
        </LinkButton>
      )}
    </section>
  );
}
