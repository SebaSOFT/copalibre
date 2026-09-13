/** Original composition — a listing screen's page-forward/back control. */
import { Button } from '../atoms/button.js';

export interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  /**
   * Required, all three: these defaulted to the literals `'Previous'`, `'Next'`
   * and `'Pagination'`, so the control stayed English in every interface
   * language. Copy belongs to the caller, which has an `intl` and a catalogue.
   */
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly navigationLabel: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel,
  nextLabel,
  navigationLabel,
}: PaginationProps): React.JSX.Element {
  return (
    <nav aria-label={navigationLabel} className="cl-pagination">
      <Button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
        variant="secondary"
      >
        {previousLabel}
      </Button>
      <span className="cl-pagination__status">
        {page} / {pageCount}
      </span>
      <Button
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        type="button"
        variant="secondary"
      >
        {nextLabel}
      </Button>
    </nav>
  );
}
