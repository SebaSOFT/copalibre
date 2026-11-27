/** A compact identity cell: emblem or monogram, display name and optional metadata. */
import type { ReactNode } from 'react';
import { EntrantEmblem } from '../../../../components/ui/molecules/EntrantEmblem.js';

type EntityIdentity =
  | { readonly name: string; readonly email?: string }
  | { readonly name?: never; readonly email: string };

export type EntityIdentityCellProps = EntityIdentity & {
  readonly abbreviation?: string;
  readonly emblemSrc?: string;
  readonly meta?: ReactNode;
};

export function EntityIdentityCell({
  name,
  email,
  abbreviation,
  emblemSrc,
  meta,
}: EntityIdentityCellProps): React.JSX.Element {
  const displayName = name ?? email;
  const monogram =
    (abbreviation ?? displayName.split('@')[0])
      .split(/[\s._-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  return (
    <div className="cl-role-user cl-entity-identity-cell">
      <EntrantEmblem
        abbreviation={monogram}
        alt={displayName}
        control
        decorative
        size={32}
        src={emblemSrc}
      />
      <span className="cl-entity-identity-cell__details">
        <strong className="cl-entity-identity-cell__name">{displayName}</strong>
        {meta !== undefined && meta !== null && (
          <span className="cl-entity-identity-cell__meta">{meta}</span>
        )}
      </span>
    </div>
  );
}
