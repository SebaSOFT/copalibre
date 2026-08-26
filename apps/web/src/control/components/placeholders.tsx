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
    <svg
      height={size}
      role="img"
      style={placeholderStyle}
      viewBox="0 0 96 96"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect
        fill="none"
        height="92"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
        width="92"
        x="2"
        y="2"
      />
      <circle cx="48" cy="38" fill="none" r="16" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 86c0-17.673 14.327-30 32-30s32 12.327 32 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
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
    <svg
      height={size}
      role="img"
      style={placeholderStyle}
      viewBox="0 0 48 48"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <path
        d="M8 6h32l-4 4v14c0 12-8 18-12 20-4-2-12-8-12-20V10z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

const placeholderStyle: React.CSSProperties = { color: 'var(--cl-text-muted)' };
