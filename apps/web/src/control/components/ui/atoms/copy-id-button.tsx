import { useState } from 'react';
import { Button } from './button.js';

/** Copies an internal identifier only after an explicit operator action. */
export function CopyIdButton({
  value,
  label,
  copiedLabel,
  failedLabel,
}: {
  readonly value: string;
  readonly label: string;
  readonly copiedLabel: string;
  readonly failedLabel: string;
}): React.JSX.Element {
  const [outcome, setOutcome] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
        setOutcome('failed');
        return;
      }
      await navigator.clipboard.writeText(value);
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
  }

  return (
    <>
      <Button onClick={() => void copy()} type="button" variant="secondary">
        {outcome === 'copied' ? copiedLabel : outcome === 'failed' ? failedLabel : label}
      </Button>
      <span className="cl-visually-hidden" role="status">
        {outcome === 'copied' ? copiedLabel : outcome === 'failed' ? failedLabel : ''}
      </span>
    </>
  );
}
