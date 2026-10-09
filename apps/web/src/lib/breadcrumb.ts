/** One level of a public page's trail; the last item is the page itself and never a link. */
export interface TrailItem {
  readonly label: string;
  readonly href?: string;
}

export interface TrailBase {
  readonly organizationName: string;
  readonly organizationPath: string;
  readonly tournamentName: string;
  readonly tournamentPath: string;
}

/**
 * The first two levels, from an overview-shaped model: `canonicalPath` is the tournament's
 * unprefixed path, `localePrefix` is `''` or `/es`. The organization's route is its alias.
 */
export function trailBaseOf(input: {
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly tournamentName: string;
  readonly canonicalPath: string;
  readonly localePrefix: string;
}): TrailBase {
  return {
    organizationName: input.organizationName,
    organizationPath: `${input.localePrefix}/${encodeURIComponent(input.organizationAlias)}`,
    tournamentName: input.tournamentName,
    tournamentPath: `${input.localePrefix}${input.canonicalPath}`,
  };
}

/**
 * The trail of a public page below the organization: organization, tournament, then the page's own
 * levels. Every level but the last is a link; the last is the current page, so its `href` is dropped.
 */
export function publicTrail(base: TrailBase, tail: readonly TrailItem[]): readonly TrailItem[] {
  const items: TrailItem[] = [
    { label: base.organizationName, href: base.organizationPath },
    { label: base.tournamentName, href: base.tournamentPath },
    ...tail,
  ];
  return items.map((item, index) => (index === items.length - 1 ? { label: item.label } : item));
}

/**
 * On a narrow viewport the first item and the last two stay and the middle collapses behind an
 * ellipsis. A trail of three or fewer never collapses. The ellipsis links to the deepest hidden level.
 */
export function collapsedRange(
  length: number,
): { readonly from: number; readonly to: number } | undefined {
  return length > 3 ? { from: 1, to: length - 3 } : undefined;
}
