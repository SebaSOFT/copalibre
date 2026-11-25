/**
 * The tournament's stages, as a row of links to each one.
 *
 * Stage and match pages show it so a visitor can move between stages without
 * going back to the schedule. It reuses the schedule filter's pill group, so
 * the control is the same vocabulary the page already teaches. Rendered
 * statically by Astro (no `client:` directive), and it works with scripting off.
 */

export interface StageSwitcherItem {
  readonly stageNumber: number;
  /** The stage's name, or the fallback the caller computes for an unnamed stage. */
  readonly label: string;
  readonly href: string;
}

export interface StageSwitcherProps {
  /** Accessible name for the navigation as a whole. */
  readonly label: string;
  readonly stages: readonly StageSwitcherItem[];
  readonly currentStageNumber: number;
}

export function StageSwitcher({ label, stages, currentStageNumber }: StageSwitcherProps) {
  if (stages.length < 2) return null;
  return (
    <nav aria-label={label} className="cl-pill-group cl-stage-switcher">
      {stages.map((stage) => {
        const current = stage.stageNumber === currentStageNumber;
        return (
          <a
            key={stage.stageNumber}
            className="cl-pill cl-focusable"
            href={stage.href}
            aria-current={current ? 'page' : undefined}
          >
            {stage.label}
          </a>
        );
      })}
    </nav>
  );
}
