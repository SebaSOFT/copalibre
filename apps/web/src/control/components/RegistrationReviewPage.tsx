import { useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Button } from './ui/button.js';
import { CountrySelect } from './CountrySelect.js';
import {
  personPhotoUrl,
  type BulkReviewRequest,
  type ReviewRegistrationRequest,
  type UploadImageRequest,
} from '../lib/api-client.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { countryFlag } from '../lib/country.js';
import { FramedImage } from './FramedImage.js';
import { ImageCropModal } from './ImageCropModal.js';
import { PersonPhotoPlaceholder } from './placeholders.js';
import {
  LOCK_EXPLANATION,
  initialReview,
  pageCount,
  teamMembershipActionsEnabled,
  setFilter,
  toggleAllVisible,
  toggleRow,
  visibleRows,
  type RegistrationRow,
  type StatusFilter,
} from '../lib/review.js';
import { messages } from '../i18n/messages.en.js';

export interface ReviewRegistrationRow extends RegistrationRow {
  readonly contactEmail: string;
  readonly teamMembers: readonly string[];
  readonly experience: string;
  readonly requiresCheckIn: boolean;
  readonly checkInClosesAt?: string;
}

const FILTERS: readonly { readonly value: StatusFilter; readonly label: MessageDescriptor }[] = [
  { value: 'all', label: messages.reviewFilterAll },
  { value: 'pending', label: messages.reviewFilterPending },
  { value: 'accepted', label: messages.reviewFilterAccepted },
  { value: 'refused', label: messages.reviewFilterRefused },
];

const STATUS_LABELS: Record<RegistrationRow['status'], MessageDescriptor> = {
  pending: messages.reviewStatusPending,
  accepted: messages.reviewStatusAccepted,
  refused: messages.reviewStatusRefused,
  withdrawn: messages.reviewStatusWithdrawn,
  'checked-in': messages.reviewStatusCheckedIn,
};

export function RegistrationReviewPage({
  organizationAlias,
  tournamentName,
  rows,
  now,
  onBulkReview,
  onReview,
  onSetNationality,
  onUploadPhoto,
}: {
  readonly organizationAlias: string;
  readonly tournamentName: string;
  readonly rows: readonly ReviewRegistrationRow[];
  readonly now: string;
  readonly onBulkReview?: (request: BulkReviewRequest) => Promise<void> | void;
  readonly onReview?: (
    entrantId: string,
    request: ReviewRegistrationRequest,
  ) => Promise<void> | void;
  /** Absent on a team-kind row; set only for a person entrant. */
  readonly onSetNationality?: (
    personId: string,
    nationality: string | null,
  ) => Promise<void> | void;
  readonly onUploadPhoto?: (personId: string, request: UploadImageRequest) => Promise<void> | void;
}): React.JSX.Element {
  const intl = useIntl();
  const [state, setState] = useState(() => initialReview(10));
  const [nationalityDraft, setNationalityDraft] = useState<Record<string, string>>({});
  const [photoCrop, setPhotoCrop] = useState<{ personId: string; src: string } | undefined>(
    undefined,
  );
  const visible = visibleRows(rows, state) as readonly ReviewRegistrationRow[];
  const selected = new Set(state.selected);
  const allVisibleSelected =
    visible.length > 0 && visible.every((row) => state.selected.includes(row.entrantId));

  return (
    <section aria-label={intl.formatMessage(messages.reviewSectionLabel)} style={stackStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            {organizationAlias} &gt; {tournamentName}
          </p>
          <h1 style={titleStyle}>
            <FormattedMessage {...messages.reviewTitle} />
          </h1>
        </div>
        <div style={actionsStyle}>
          <select
            aria-label={intl.formatMessage(messages.reviewStatusFieldLabel)}
            className="cl-focusable"
            onChange={(event) =>
              setState((current) => setFilter(current, event.target.value as StatusFilter, rows))
            }
            style={selectStyle}
            value={state.filter}
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {intl.formatMessage(filter.label)}
              </option>
            ))}
          </select>
          <Button
            disabled={state.selected.length === 0}
            onClick={() =>
              void onBulkReview?.({ entrantIds: state.selected, decision: 'accepted' })
            }
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.reviewApprove} />
          </Button>
          <Button
            disabled={state.selected.length === 0}
            onClick={() => void onBulkReview?.({ entrantIds: state.selected, decision: 'refused' })}
            type="button"
            variant="destructive-outline"
          >
            <FormattedMessage {...messages.reviewRefuse} />
          </Button>
          <Button type="button">
            <FormattedMessage {...messages.reviewExport} />
          </Button>
        </div>
      </header>

      <div
        aria-label={intl.formatMessage(messages.reviewSectionLabel)}
        className="cl-card cl-chamfer cl-chamfer--control"
        role="region"
        style={tableStyle}
        tabIndex={0}
      >
        <div style={tableHeaderStyle}>
          <input
            aria-label={intl.formatMessage(messages.reviewSelectVisible)}
            checked={allVisibleSelected}
            onChange={() => setState((current) => toggleAllVisible(current, rows))}
            type="checkbox"
          />
          <span>
            <FormattedMessage {...messages.reviewColumnName} />
          </span>
          <span>
            <FormattedMessage {...messages.reviewColumnStatus} />
          </span>
          <span>
            <FormattedMessage {...messages.reviewColumnSubmitted} />
          </span>
        </div>
        {visible.map((row) => {
          const teamMembershipEnabled = teamMembershipActionsEnabled({
            requiresCheckIn: row.requiresCheckIn,
            checkInClosesAt: row.checkInClosesAt,
            status: row.status,
            now,
          });
          const personId = row.personId;
          return (
            <details className="cl-focusable" key={row.entrantId} style={rowStyle}>
              <summary style={summaryStyle}>
                <input
                  aria-label={intl.formatMessage(messages.reviewSelectRow, {
                    displayName: row.displayName,
                  })}
                  checked={selected.has(row.entrantId)}
                  onChange={() => setState((current) => toggleRow(current, row.entrantId))}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
                <span>
                  <strong>
                    {row.nationality !== undefined && (
                      <span aria-hidden="true">{countryFlag(row.nationality)} </span>
                    )}
                    {row.displayName}
                  </strong>
                  <small style={smallStyle}>
                    {intl.formatMessage(messages.reviewIdLabel, { entrantId: row.entrantId })}
                  </small>
                </span>
                <span className="cl-badge">{intl.formatMessage(STATUS_LABELS[row.status])}</span>
                <time dateTime={row.submittedAt} style={smallStyle}>
                  {row.submittedAt}
                </time>
              </summary>
              <div style={detailStyle}>
                <FieldValue
                  label={intl.formatMessage(messages.reviewContact)}
                  value={row.contactEmail}
                />
                <FieldValue
                  label={intl.formatMessage(messages.reviewTeamMembers)}
                  value={
                    row.teamMembers.length === 0
                      ? intl.formatMessage(messages.reviewTeamMembersUnavailable)
                      : row.teamMembers.join(', ')
                  }
                />
                <FieldValue
                  label={intl.formatMessage(messages.reviewExperience)}
                  value={row.experience}
                />
                {personId !== undefined && (
                  <div style={fieldValueStyle}>
                    <span style={smallStyle}>
                      {intl.formatMessage(messages.reviewNationalityLabel)}
                    </span>
                    <CountrySelect
                      onChange={(code) =>
                        setNationalityDraft((current) => ({ ...current, [personId]: code }))
                      }
                      value={nationalityDraft[personId] ?? row.nationality}
                    />
                    <Button
                      onClick={() =>
                        void onSetNationality?.(
                          personId,
                          nationalityDraft[personId] ?? row.nationality ?? null,
                        )
                      }
                      type="button"
                      variant="secondary"
                    >
                      <FormattedMessage {...messages.reviewSaveNationality} />
                    </Button>
                    <FramedImage
                      alt={intl.formatMessage(messages.reviewUploadPhoto)}
                      placeholder={
                        <PersonPhotoPlaceholder
                          size={64}
                          title={intl.formatMessage(messages.reviewUploadPhoto)}
                        />
                      }
                      size={64}
                      src={
                        row.photoObjectId !== undefined
                          ? personPhotoUrl(organizationAlias, personId)
                          : undefined
                      }
                    />
                    <label>
                      <FormattedMessage {...messages.reviewUploadPhoto} />
                      <input
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (!file) return;
                          setPhotoCrop({ personId, src: URL.createObjectURL(file) });
                          event.currentTarget.value = '';
                        }}
                        type="file"
                      />
                    </label>
                    <a
                      className="cl-focusable"
                      href={`/control/${organizationAlias}/persons/${personId}`}
                      onClick={controlLinkClick(
                        `/control/${organizationAlias}/persons/${personId}`,
                      )}
                    >
                      <FormattedMessage {...messages.reviewViewProfile} />
                    </a>
                  </div>
                )}
                <div style={detailActionsStyle}>
                  <Button type="button" variant="secondary">
                    <FormattedMessage {...messages.reviewMessage} />
                  </Button>
                  <Button disabled={!teamMembershipEnabled} type="button" variant="secondary">
                    <FormattedMessage {...messages.reviewEditMembers} />
                  </Button>
                  <Button
                    onClick={() =>
                      void onReview?.(row.entrantId, {
                        decision: 'withdrawn',
                        reason: 'Revoked from registration review',
                      })
                    }
                    type="button"
                    variant="destructive-outline"
                  >
                    <FormattedMessage {...messages.reviewRevoke} />
                  </Button>
                </div>
                {!teamMembershipEnabled && (
                  <p className="cl-inline-alert" style={lockStyle}>
                    {intl.formatMessage(LOCK_EXPLANATION)}
                  </p>
                )}
              </div>
            </details>
          );
        })}
        {visible.length === 0 && (
          <p>
            <FormattedMessage {...messages.reviewEmptyFilter} />
          </p>
        )}
      </div>

      <footer style={paginationStyle}>
        <span>
          {intl.formatMessage(messages.reviewPagination, {
            page: state.page,
            pageCount: pageCount(rows, state),
          })}
        </span>
      </footer>

      {photoCrop !== undefined && (
        <ImageCropModal
          imageSrc={photoCrop.src}
          onCancel={() => {
            URL.revokeObjectURL(photoCrop.src);
            setPhotoCrop(undefined);
          }}
          onConfirm={(output) => {
            URL.revokeObjectURL(photoCrop.src);
            const personId = photoCrop.personId;
            setPhotoCrop(undefined);
            void onUploadPhoto?.(personId, {
              filename: 'photo.png',
              contentType: output.contentType,
              contentBase64: output.contentBase64,
            });
          }}
        />
      )}
    </section>
  );
}

function FieldValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.JSX.Element {
  return (
    <div style={fieldValueStyle}>
      <span style={smallStyle}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const stackStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-6)' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: 'var(--cl-space-4)',
  flexWrap: 'wrap',
};
const metaStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
  textTransform: 'uppercase',
};
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
  fontSize: 'var(--cl-font-size-3xl)',
  textTransform: 'uppercase',
};
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
};
const selectStyle: React.CSSProperties = {
  minHeight: 44,
  background: 'var(--cl-surface-base)',
  color: 'var(--cl-text-primary)',
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-2) var(--cl-space-3)',
};
const tableStyle: React.CSSProperties = {
  display: 'grid',
  gap: 0,
  padding: 0,
  overflowX: 'auto',
  scrollbarGutter: 'stable',
};
const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px 2fr 1fr 1fr',
  minWidth: 640,
  gap: 'var(--cl-space-3)',
  alignItems: 'center',
  padding: 'var(--cl-space-3) var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: 'var(--cl-font-size-xs)',
};
const rowStyle: React.CSSProperties = { borderBottom: '1px solid var(--cl-border-muted)' };
const summaryStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '44px 2fr 1fr 1fr',
  minWidth: 640,
  gap: 'var(--cl-space-3)',
  alignItems: 'center',
  padding: 'var(--cl-space-4)',
  cursor: 'pointer',
};
const smallStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-xs)',
};
const detailStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 'var(--cl-space-4)',
  padding: '0 var(--cl-space-4) var(--cl-space-4) 64px',
};
const detailActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
  alignItems: 'end',
};
const fieldValueStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  background: 'var(--cl-surface-base)',
  padding: 'var(--cl-space-3)',
  border: '1px solid var(--cl-border-muted)',
};
const lockStyle: React.CSSProperties = { gridColumn: '1 / -1', margin: 0 };
const paginationStyle: React.CSSProperties = {
  color: 'var(--cl-text-secondary)',
  fontFamily: 'var(--cl-font-mono)',
};
