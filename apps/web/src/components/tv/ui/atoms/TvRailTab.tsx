/**
 * The broadcast surface's button owner (openspec 0225 task 7.1) — under a
 * `ui/` directory, the same way `Button.astro` owns `<button>` for the
 * non-broadcast public surface. The admin `Button` atom (`control/`) is not
 * reused here for the same reason `DataTable` is not: its classes carry the
 * admin control theme, not this surface's `--tv-*` tokens.
 */
export function TvRailTab({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      className={`tv-rail-tab cl-chamfer ${active ? 'tv-rail-tab--active' : ''}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
