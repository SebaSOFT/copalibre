import { useState } from 'react';
import { Button } from './button.js';
import { Input } from './input.js';
import { Inline } from './layout/inline.js';
import { Stack } from './layout/stack.js';

export interface StringListInputProps {
  readonly items: readonly string[];
  readonly onAdd: (item: string) => void;
  readonly onRemove: (index: number) => void;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly placeholder?: string;
  readonly 'aria-label'?: string;
}

/** An add/remove editable list of plain strings — never a JSON array typed by hand. */
export function StringListInput({
  items,
  onAdd,
  onRemove,
  addLabel,
  removeLabel,
  placeholder,
  'aria-label': ariaLabel,
}: StringListInputProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  return (
    <Stack gap="2">
      {items.length > 0 && (
        <ul>
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <Inline align="center" gap="2">
                <span>{item}</span>
                <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                  {removeLabel}
                </Button>
              </Inline>
            </li>
          ))}
        </ul>
      )}
      <Inline gap="2">
        <Input
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          value={draft}
        />
        <Button
          disabled={draft.trim() === ''}
          onClick={() => {
            const trimmed = draft.trim();
            if (trimmed === '') return;
            onAdd(trimmed);
            setDraft('');
          }}
          type="button"
          variant="secondary"
        >
          {addLabel}
        </Button>
      </Inline>
    </Stack>
  );
}
