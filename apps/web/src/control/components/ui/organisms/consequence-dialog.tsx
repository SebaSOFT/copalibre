import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '../atoms/button.js';
import { Field } from '../molecules/field.js';
import { Input } from '../atoms/input.js';
import { Modal } from './modal.js';

export interface ConsequenceCount {
  readonly label: string;
  readonly value: number;
}

export interface ConsequenceDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly counts: readonly ConsequenceCount[];
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly closeLabel: string;
  readonly typeToConfirm?: string;
  readonly typeToConfirmLabel?: string;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
}

/** States exact consequences before an irreversible action and gates named deletes on typed confirmation. */
export function ConsequenceDialog({
  open,
  onOpenChange,
  title,
  description,
  counts,
  confirmLabel,
  cancelLabel,
  closeLabel,
  typeToConfirm,
  typeToConfirmLabel,
  busy = false,
  onConfirm,
}: ConsequenceDialogProps): React.JSX.Element {
  const intl = useIntl();
  const [typedName, setTypedName] = useState('');

  function changeOpen(nextOpen: boolean): void {
    if (!nextOpen) setTypedName('');
    onOpenChange(nextOpen);
  }

  const nameConfirmed = typeToConfirm === undefined || typedName === typeToConfirm;

  return (
    <Modal
      closeLabel={closeLabel}
      description={description}
      footer={
        <>
          <Button
            disabled={busy}
            onClick={() => changeOpen(false)}
            type="button"
            variant="secondary"
          >
            {cancelLabel}
          </Button>
          <Button
            disabled={busy || !nameConfirmed}
            onClick={() => {
              setTypedName('');
              onConfirm();
            }}
            type="button"
            variant="destructive-outline"
          >
            {confirmLabel}
          </Button>
        </>
      }
      onOpenChange={changeOpen}
      open={open}
      title={title}
    >
      <ul aria-label={title} className="cl-consequence-dialog__counts">
        {counts.map((count) => (
          <li key={count.label}>
            <strong>{intl.formatNumber(count.value)}</strong>
            <span>{count.label}</span>
          </li>
        ))}
      </ul>
      {typeToConfirm !== undefined && typeToConfirmLabel !== undefined && (
        <>
          <p>{typeToConfirm}</p>
          <Field id="consequence-confirm-name" label={typeToConfirmLabel}>
            <Input
              autoComplete="off"
              id="consequence-confirm-name"
              onChange={(event) => setTypedName(event.target.value)}
              value={typedName}
            />
          </Field>
        </>
      )}
    </Modal>
  );
}
