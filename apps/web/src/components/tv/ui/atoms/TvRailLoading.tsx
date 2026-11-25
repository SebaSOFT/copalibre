/**
 * A rail tab whose data is still arriving. It reuses the public skeleton line rather than a TV-only
 * spinner: the same shape the public page header shows while its title loads.
 */
export function TvRailLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="tv-rail-loading" data-testid="tv-rail-loading" role="status">
      <span className="cl-skeleton cl-skeleton--line">
        <span aria-hidden="true" className="cl-skeleton__shape" />
      </span>
    </div>
  );
}
