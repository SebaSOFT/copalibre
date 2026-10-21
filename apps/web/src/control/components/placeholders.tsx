import { Icon } from './ui/atoms/icon.js';

/**
 * Placeholder images shown in place of a person's photo or a club's emblem
 * when none has been uploaded — a generic person silhouette and a generic
 * club-shield outline, never a broken image or empty gap.
 * `currentColor` so each inherits the surrounding text color rather than a
 * hardcoded token, matching the outline-only, non-photorealistic style the
 * design calls for.
 */

export function PersonPhotoPlaceholder({
  title,
  size = 96,
}: {
  readonly title: string;
  readonly size?: number;
}): React.JSX.Element {
  return (
    <span
      title={title}
      role="img"
      className={`cl-person-photo-placeholder cl-placeholder-size-${size}`}
    >
      <Icon name="user" size={24} />
    </span>
  );
}

export function ClubEmblemPlaceholder({
  title,
  size = 48,
}: {
  readonly title: string;
  readonly size?: number;
}): React.JSX.Element {
  return (
    <span
      title={title}
      role="img"
      className={`cl-club-emblem-placeholder cl-placeholder-size-${size}`}
    >
      <Icon name="club" size={24} />
    </span>
  );
}
