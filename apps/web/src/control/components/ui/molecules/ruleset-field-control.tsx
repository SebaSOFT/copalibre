/**
 * One ruleset-override field's typed edit control, dispatched by
 * `chooseControlKind` (openspec 0264 design.md's "Control selection"
 * decision) — never a text input the operator fills with hand-typed JSON.
 *
 * Reports a field's *stored override value* via `onChange` — for a
 * `replaced` field that is the field's full value; for a `merged` field
 * (`union-list`/`append-list`/`shallow-object`) it is only the delta/patch
 * the compiler applies on top of the inherited value, never the resolved
 * value (`mergeWithStrategy`, `packages/domain`).
 *
 * Takes every string already formatted — i18n sits at organism and above
 * (`scripts/check-atomic-composition.mjs`'s own rule), so the caller resolves
 * these via `useIntl()`, not this molecule.
 */
import { useState } from 'react';
import type { FieldPolicy } from '@copalibre/domain';
import { Checkbox } from '../atoms/checkbox.js';
import { Input } from '../atoms/input.js';
import { Select } from '../atoms/select.js';
import { StringListInput } from '../atoms/string-list-input.js';
import { Stack } from '../atoms/layout/stack.js';
import { Field } from './field.js';
import { chooseControlKind } from '../../../lib/discipline-summary.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function subkeyControlValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === undefined || value === null) return '';
  return String(value);
}

export interface RulesetFieldControlProps {
  readonly id: string;
  readonly dotPath: string;
  /** The field's human-readable name — used as the composite controls' (add-to-list/patch-object) own accessible label, since the outer `Field`'s `htmlFor` cannot target a single element in a multi-control field. */
  readonly label: string;
  readonly policy: FieldPolicy | undefined;
  /** This field's currently stored override value, if the tournament has one. */
  readonly overrideValue: unknown;
  /** The discipline's own default value at this dot-path. */
  readonly disciplineDefaultValue: unknown;
  readonly availableFormats: readonly string[];
  readonly onChange: (value: unknown) => void;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly inheritedHeading: string;
  readonly unrecognizedText: string;
  readonly unknownTypeText: string;
}

export function RulesetFieldControl({
  id,
  dotPath,
  label,
  policy,
  overrideValue,
  disciplineDefaultValue,
  availableFormats,
  onChange,
  addLabel,
  removeLabel,
  inheritedHeading,
  unrecognizedText,
  unknownTypeText,
}: RulesetFieldControlProps): React.JSX.Element {
  const observedValue = overrideValue !== undefined ? overrideValue : disciplineDefaultValue;
  const kind = chooseControlKind(policy, observedValue, dotPath);
  const [rawText, setRawText] = useState(() => JSON.stringify(observedValue ?? null));
  const [touchedSubkeys, setTouchedSubkeys] = useState<ReadonlySet<string>>(
    () => new Set(isPlainObject(overrideValue) ? Object.keys(overrideValue) : []),
  );
  const [subkeyValues, setSubkeyValues] = useState<Record<string, unknown>>(() => ({
    ...(isPlainObject(disciplineDefaultValue) ? disciplineDefaultValue : {}),
    ...(isPlainObject(overrideValue) ? overrideValue : {}),
  }));

  if (kind === undefined) return <></>;

  switch (kind) {
    case 'checkbox':
      return (
        <Checkbox
          checked={Boolean(observedValue)}
          id={id}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );
    case 'number':
      return (
        <Input
          id={id}
          onChange={(event) =>
            onChange(event.target.value === '' ? undefined : Number(event.target.value))
          }
          type="number"
          value={observedValue === undefined ? '' : String(observedValue)}
        />
      );
    case 'format-select':
      return (
        <Select
          id={id}
          onValueChange={onChange}
          options={availableFormats.map((format) => ({ value: format, label: format }))}
          value={typeof observedValue === 'string' ? observedValue : ''}
        />
      );
    case 'text':
      return (
        <Input
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={typeof observedValue === 'string' ? observedValue : ''}
        />
      );
    case 'add-to-list': {
      const inherited = Array.isArray(disciplineDefaultValue) ? disciplineDefaultValue : [];
      const added = Array.isArray(overrideValue) ? overrideValue : [];
      return (
        <Stack gap="2">
          {inherited.length > 0 && (
            <p>
              {inheritedHeading} {inherited.join(', ')}
            </p>
          )}
          <StringListInput
            addLabel={addLabel}
            aria-label={label}
            items={added.map(String)}
            onAdd={(item) => onChange([...added, item])}
            onRemove={(index) => onChange(added.filter((_entry, i) => i !== index))}
            removeLabel={removeLabel}
          />
        </Stack>
      );
    }
    case 'patch-object': {
      const inherited = isPlainObject(disciplineDefaultValue) ? disciplineDefaultValue : {};
      return (
        <Stack gap="2">
          {Object.keys(inherited).map((subkey) => {
            const subkeyId = `${id}-${subkey}`;
            const inheritedValue = inherited[subkey];
            const currentValue = subkeyValues[subkey] ?? inheritedValue;
            const commit = (nextValue: unknown): void => {
              const nextValues = { ...subkeyValues, [subkey]: nextValue };
              const nextTouched = new Set(touchedSubkeys);
              nextTouched.add(subkey);
              setSubkeyValues(nextValues);
              setTouchedSubkeys(nextTouched);
              const patch: Record<string, unknown> = {};
              for (const key of nextTouched) patch[key] = nextValues[key];
              onChange(patch);
            };
            if (typeof inheritedValue === 'boolean') {
              return (
                <Field id={subkeyId} key={subkey} label={subkey}>
                  <Checkbox
                    checked={Boolean(currentValue)}
                    id={subkeyId}
                    onCheckedChange={commit}
                  />
                </Field>
              );
            }
            if (typeof inheritedValue === 'number') {
              return (
                <Field id={subkeyId} key={subkey} label={subkey}>
                  <Input
                    id={subkeyId}
                    onChange={(event) =>
                      commit(event.target.value === '' ? undefined : Number(event.target.value))
                    }
                    type="number"
                    value={subkeyControlValue(currentValue)}
                  />
                </Field>
              );
            }
            return (
              <Field id={subkeyId} key={subkey} label={subkey}>
                <Input
                  id={subkeyId}
                  onChange={(event) => commit(event.target.value)}
                  value={subkeyControlValue(currentValue)}
                />
              </Field>
            );
          })}
        </Stack>
      );
    }
    case 'raw-json':
    default:
      return (
        <Stack gap="1">
          <Input
            id={id}
            onChange={(event) => {
              const text = event.target.value;
              setRawText(text);
              try {
                onChange(JSON.parse(text));
              } catch {
                // Invalid JSON mid-edit — hold the text locally without
                // propagating, same as the field it replaces once did.
              }
            }}
            value={rawText}
          />
          <p>{policy === undefined ? unrecognizedText : unknownTypeText}</p>
        </Stack>
      );
  }
}
