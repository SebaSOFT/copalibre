import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { isAbbreviation, MAX_ABBREVIATION_LENGTH } from '@copalibre/domain';
import { Button } from './ui/atoms/button.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

export interface AbbreviationCandidateRow {
  readonly entrantId: string;
  readonly displayName: string;
}

/**
 * Entrants that registered with no abbreviation because every derived
 * candidate collided (0100, 0111). Rare and empty in the common case — the
 * API and the write path this calls already exist; this is only the
 * visibility and per-entrant set action neither had before.
 */
export function AbbreviationReviewSection({
  rows,
  onSetAbbreviation,
}: {
  readonly rows: readonly AbbreviationCandidateRow[];
  readonly onSetAbbreviation?: (entrantId: string, abbreviation: string) => Promise<unknown> | void;
}): React.JSX.Element {
  const intl = useIntl();
  const { pushError } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(entrantId: string): void {
    const value = (drafts[entrantId] ?? '').trim();
    if (!isAbbreviation(value)) {
      setErrors((current) => ({
        ...current,
        [entrantId]: intl.formatMessage(messages.abbreviationReviewFormatError, {
          maxLength: MAX_ABBREVIATION_LENGTH,
        }),
      }));
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[entrantId];
      return next;
    });
    const result = onSetAbbreviation?.(entrantId, value);
    if (result) {
      void result.catch((error: unknown) => pushError(error));
    }
  }

  return (
    <section
      aria-label={intl.formatMessage(messages.abbreviationReviewSectionLabel)}
      className="cl-card cl-chamfer cl-chamfer--control"
      style={sectionStyle}
    >
      <h2 style={titleStyle}>
        <FormattedMessage {...messages.abbreviationReviewTitle} />
      </h2>
      {rows.length === 0 ? (
        <p>
          <FormattedMessage {...messages.abbreviationReviewEmpty} />
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.entrantId} style={rowStyle}>
            <span>{row.displayName}</span>
            <input
              aria-label={intl.formatMessage(messages.abbreviationReviewInputLabel, {
                displayName: row.displayName,
              })}
              className="cl-focusable"
              onChange={(event) =>
                setDrafts((current) => ({ ...current, [row.entrantId]: event.target.value }))
              }
              value={drafts[row.entrantId] ?? ''}
            />
            <Button onClick={() => submit(row.entrantId)} type="button" variant="secondary">
              <FormattedMessage {...messages.abbreviationReviewSet} />
            </Button>
            {errors[row.entrantId] && (
              <p className="cl-inline-alert" style={errorStyle}>
                {errors[row.entrantId]}
              </p>
            )}
          </div>
        ))
      )}
    </section>
  );
}

const sectionStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-base)',
  textTransform: 'uppercase',
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const errorStyle: React.CSSProperties = { flexBasis: '100%', margin: 0 };
