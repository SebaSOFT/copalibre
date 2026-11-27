import { useEffect, useRef } from 'react';
import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { EntrantEmblem } from '../../../ui/molecules/EntrantEmblem.js';
import {
  formatOverallPlaceFromTemplate,
  formatPlacement,
  formatPlacementSource,
  placementOf,
} from '../../../../lib/side-source.js';
import { toNode, toRounds, type BracketRound } from '../../../../lib/bracket.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvClubItem, TvDashboardLabels } from '../../tv-types.js';

function appendOverallPlace(
  base: string | undefined,
  place: number | undefined,
  overallPlaceOffset: number | undefined,
  labels: TvDashboardLabels,
): string | undefined {
  if (base === undefined || place === undefined || overallPlaceOffset === undefined) return base;
  if (!labels.overallPlace) return base;
  const suffix = formatOverallPlaceFromTemplate(
    labels.overallPlace,
    overallPlaceOffset + place,
    labels.sideSource,
  );
  return `${base} · ${suffix}`;
}

export function tvBracketBranchLabel(
  branch: string,
  zoneName: string | undefined,
  labels: TvDashboardLabels,
): string {
  switch (branch) {
    case 'winner':
    case 'winners':
      return zoneName?.trim() || labels.bracketBranch.winners;
    case 'loser':
    case 'losers':
      return labels.bracketBranch.losers;
    case 'grand-final':
      return labels.bracketBranch.grandFinal;
    case 'placement':
      return labels.bracketBranch.placement;
    default:
      return /^(?:pl\d+|placement)/.test(branch) ? labels.bracketBranch.placement : branch;
  }
}

export function tvBracketRoundTitle(
  round: BracketRound,
  rounds: readonly BracketRound[],
  labels: TvDashboardLabels,
  overallPlaceOffset?: number,
): string {
  if (round.branch === 'placement' || /^(?:pl\d+|placement)/.test(round.branch)) {
    const zoneNodeKeys = rounds.flatMap((entry) => entry.matches.map((match) => match.nodeKey));
    const placements = new Set<string>();
    for (const match of round.matches) {
      const placement =
        placementOf(match.nodeKey, zoneNodeKeys) ??
        (match.role ? placementOf(match.role, zoneNodeKeys) : undefined);
      if (placement !== undefined) {
        const base = formatPlacement(placement, labels.sideSource);
        const label =
          placement.to === undefined
            ? (appendOverallPlace(base, placement.from, overallPlaceOffset, labels) ?? base)
            : base;
        placements.add(label);
      } else if (match.role) {
        const single = /^(?:placement|place)-(\d+)$/.exec(match.role);
        const base = formatPlacementSource(match.role, labels.sideSource, {
          siblingKeys: zoneNodeKeys,
        });
        const label = appendOverallPlace(
          base,
          single ? Number(single[1]) : undefined,
          overallPlaceOffset,
          labels,
        );
        if (label !== undefined) placements.add(label);
      }
    }
    if (placements.size > 0) return [...placements].join(' · ');
    return `${labels.bracketRound} ${round.roundNumber}`;
  }

  const branchRounds = rounds
    .filter((candidate) => candidate.branch === round.branch)
    .sort((left, right) => left.roundNumber - right.roundNumber);
  const index = branchRounds.findIndex((candidate) => candidate.roundNumber === round.roundNumber);
  const roundsRemaining = branchRounds.length - index;
  if (roundsRemaining === 1) return labels.bracketRoundFinal;
  if (roundsRemaining === 2) return labels.bracketRoundSemifinals;
  if (roundsRemaining === 3) return labels.bracketRoundQuarterfinals;
  return `${labels.bracketRound} ${round.roundNumber}`;
}

/** A bracket match named the way a bracket names it: its node key within a zone. */
export interface BracketFocus {
  readonly nodeKey: string;
  readonly zoneName?: string;
}

/** Whether `zone` holds the focused match: the same zone (by name) and the same node key. */
export function holdsBracketMatch(zone: BracketZone, focus: BracketFocus): boolean {
  return (
    zone.zoneName === focus.zoneName &&
    zone.matches.some((match) => match.nodeKey === focus.nodeKey)
  );
}

/**
 * Scrolls the nearest scrolling ancestor of `card` so the card sits in the middle of it. Only that
 * ancestor moves: a TV frame never scrolls as a whole, and `scrollIntoView` would move every ancestor.
 */
function centerWithinScroller(card: HTMLElement): void {
  let scroller: HTMLElement | null = card.parentElement;
  while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) {
    scroller = scroller.parentElement;
  }
  if (scroller === null || scroller === document.documentElement || scroller === document.body) {
    return;
  }
  const cardBox = card.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  scroller.scrollTop +=
    cardBox.top - scrollerBox.top - (scroller.clientHeight - cardBox.height) / 2;
}

/**
 * The bracket as TV draws it: round by round, each side named in full beside its crest, falling back to
 * the abbreviation only when the name does not fit. A TV frame is not scrolled by anyone, so the match
 * the screen is about (`focus`) is marked and brought into view.
 */
export function TvBracketView({
  zones,
  labels,
  clubs,
  focus,
}: {
  readonly zones: readonly BracketZone[];
  readonly labels: TvDashboardLabels;
  readonly clubs?: readonly TvClubItem[];
  /** The match the screen is about (pinned, else featured), by its zone and node key. */
  readonly focus?: BracketFocus;
}): React.JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  // The focus as one value, so a new object naming the same match does not scroll again.
  const focusKey = focus === undefined ? undefined : `${focus.zoneName ?? ''}|${focus.nodeKey}`;
  useEffect(() => {
    if (focusKey === undefined) return;
    const card = sectionRef.current?.querySelector<HTMLElement>('.tv-bracket-card--focus');
    if (card) centerWithinScroller(card);
  }, [focusKey, zones]);
  return (
    <section
      aria-label={labels.bracketTab}
      className="tv-bracket"
      data-testid="tv-bracket"
      ref={sectionRef}
    >
      {zones.map((zone, zoneIndex) => {
        const rounds = toRounds(zone.matches);
        const zoneNodeKeys = zone.matches.map((match) => match.nodeKey);
        return (
          <div className="tv-bracket__zone" key={zone.zoneId ?? zoneIndex}>
            {zone.zoneName && <h3 className="tv-bracket__zone-name">{zone.zoneName}</h3>}
            {rounds.map((round) => (
              <div className="tv-bracket__round" key={`${round.branch}-${round.roundNumber}`}>
                <h4 className="tv-bracket__round-name">
                  {tvBracketBranchLabel(round.branch, zone.zoneName, labels)} ·{' '}
                  {tvBracketRoundTitle(round, rounds, labels, zone.overallPlaceOffset)}
                </h4>
                <div className="tv-bracket__matches">
                  {round.matches.map((match) => {
                    const node = toNode(match, labels.resultState, labels.sideSource, zoneNodeKeys);
                    const singleRole = /^(?:placement|place)-(\d+)$/.exec(match.role ?? '');
                    const focused =
                      focus !== undefined &&
                      zone.zoneName === focus.zoneName &&
                      match.nodeKey === focus.nodeKey;
                    return (
                      <article
                        aria-current={focused ? 'true' : undefined}
                        aria-label={`${labels.bracketMatch} ${match.matchNumber}`}
                        className={`tv-bracket-card cl-chamfer cl-chamfer--control${
                          focused ? ' tv-bracket-card--focus' : ''
                        }`}
                        key={match.matchId ?? match.matchNumber}
                      >
                        <div className="tv-bracket-card__header">
                          <span>
                            {match.role
                              ? appendOverallPlace(
                                  formatPlacementSource(match.role, labels.sideSource, {
                                    siblingKeys: zoneNodeKeys,
                                  }),
                                  singleRole ? Number(singleRole[1]) : undefined,
                                  zone.overallPlaceOffset,
                                  labels,
                                )
                              : `${labels.bracketMatch} ${match.matchNumber}`}
                          </span>
                          <span>{node.badge.label}</span>
                        </div>
                        {node.slots.map((slot, index) => (
                          <div
                            className="tv-bracket-card__slot"
                            key={`${index}-${slot.entrantId ?? slot.label}`}
                          >
                            <span className="tv-bracket-card__side">
                              {slot.clubId !== undefined && (
                                <EntrantEmblem
                                  abbreviation={slot.abbreviation}
                                  alt=""
                                  className="tv-table-club-emblem cl-entrant-emblem--small"
                                  decorative
                                  eager
                                  size="3vmin"
                                  src={
                                    clubs?.find((club) => club.clubId === slot.clubId)?.emblemUrl
                                  }
                                />
                              )}
                              <EntrantName
                                className="tv-bracket-card__name"
                                pending={slot.pending}
                                fullName={slot.label}
                                abbreviation={slot.abbreviation}
                              />
                            </span>
                            {slot.score !== undefined && (
                              <strong className="tv-bracket-card__score">{slot.score}</strong>
                            )}
                          </div>
                        ))}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
