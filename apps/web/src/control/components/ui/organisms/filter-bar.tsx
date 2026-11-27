import type { ReactNode } from 'react';
import { Button } from '../atoms/button.js';
import { Input } from '../atoms/input.js';
import { Field } from '../molecules/field.js';

export interface FilterBarOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

export interface FilterBarProps {
  readonly searchId: string;
  readonly searchLabel: string;
  readonly searchValue: string;
  readonly searchPlaceholder?: string;
  readonly onSearchChange: (value: string) => void;
  readonly filtersLabel: string;
  readonly options: readonly FilterBarOption[];
  readonly selectedOptionId: string;
  readonly onOptionChange: (id: string) => void;
  readonly resultCount: ReactNode;
}

/** Search, lifecycle filters and result count for one collection. */
export function FilterBar({
  searchId,
  searchLabel,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  filtersLabel,
  options,
  selectedOptionId,
  onOptionChange,
  resultCount,
}: FilterBarProps): React.JSX.Element {
  return (
    <div className="cl-filter-bar">
      <Field id={searchId} label={searchLabel}>
        <Input
          id={searchId}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          type="search"
          value={searchValue}
        />
      </Field>
      <div aria-label={filtersLabel} className="cl-filter-bar__filters" role="group">
        {options.map((option) => {
          const selected = option.id === selectedOptionId;
          return (
            <Button
              aria-pressed={selected}
              className="cl-filter-bar__option"
              key={option.id}
              onClick={() => onOptionChange(option.id)}
              type="button"
              variant="secondary"
            >
              {option.label}
              <span aria-hidden="true" className="cl-filter-bar__count">
                {' '}
                ({option.count})
              </span>
            </Button>
          );
        })}
      </div>
      <output className="cl-filter-bar__result-count">{resultCount}</output>
    </div>
  );
}
