/** Original composition — a listing screen's page-forward/back control. */
import { Button } from '../atoms/button.js';

export interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  previousLabel = 'Previous',
  nextLabel = 'Next',
}: PaginationProps): React.JSX.Element {
  return (
    <nav aria-label="Pagination" className="cl-pagination">
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
