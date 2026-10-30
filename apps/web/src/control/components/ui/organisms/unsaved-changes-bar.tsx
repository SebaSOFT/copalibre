import { Button } from '../atoms/button.js';
import { Card } from '../atoms/card.js';

export interface UnsavedChangesBarField {
  readonly id: string;
  readonly label: string;
}

export interface UnsavedChangesBarProps {
  readonly dirty: boolean;
  readonly summary: string;
  readonly fieldsLabel: string;
  readonly changedFields: readonly UnsavedChangesBarField[];
  readonly resetLabel: string;
  readonly saveLabel: string;
  readonly onReset: () => void;
  readonly onSave: () => void;
}

/** Persistent save controls shown only while the form has unsaved changes. */
export function UnsavedChangesBar({
  dirty,
  summary,
  fieldsLabel,
  changedFields,
  resetLabel,
  saveLabel,
  onReset,
  onSave,
}: UnsavedChangesBarProps): React.JSX.Element | null {
  if (!dirty) return null;

  return (
    <Card aria-label={summary} aria-live="polite" className="cl-unsaved-changes-bar" role="status">
      <div className="cl-unsaved-changes-bar__details">
        <strong>{summary}</strong>
        {changedFields.length > 0 && (
          <ul aria-label={fieldsLabel} className="cl-unsaved-changes-bar__fields">
            {changedFields.map((field) => (
              <li key={field.id}>{field.label}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="cl-unsaved-changes-bar__actions">
        <Button onClick={onReset} type="button" variant="secondary">
          {resetLabel}
        </Button>
        <Button onClick={onSave} type="button">
          {saveLabel}
        </Button>
      </div>
    </Card>
  );
}
