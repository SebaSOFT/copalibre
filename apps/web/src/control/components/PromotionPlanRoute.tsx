import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type PromotionPreviewResponse,
  type ZoneResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/button.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

interface BandRow {
  readonly key: string;
  readonly zoneRef: string;
  readonly count: string;
}

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `band-${rowCounter}`;
}

/**
 * A zone's promotion-plan configuration and review (0108) — "decision
 * support, not automation" (0099): saving a plan and reviewing its computed
 * candidate list never writes a next stage's seeding. Only `combination.mode
 * === 'group-order'` is offered here (no config needed); `ranked`/`manual`
 * need a pipeline- or order-authoring UI this screen doesn't build yet
 * (tracked as a follow-up, tasks.md section 6).
 */
export function PromotionPlanRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  zoneNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly zoneNumber: number;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [zone, setZone] = useState<ZoneResponse | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [nextStageNumber, setNextStageNumber] = useState('');
  const [perGroupAdvance, setPerGroupAdvance] = useState('1');
  const [bands, setBands] = useState<readonly BandRow[]>([]);
  const [preview, setPreview] = useState<PromotionPreviewResponse | undefined>(undefined);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const zones = await api.listZones?.(organizationAlias, tournamentAlias, stageNumber);
        setZone(zones?.find((candidate) => candidate.number === zoneNumber));
      } catch {
        setZone(undefined);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [api, organizationAlias, tournamentAlias, stageNumber, zoneNumber]);

  const loadPreview = useCallback(async (): Promise<void> => {
    try {
      const loaded = await api.fetchPromotionPreview?.(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        zoneNumber,
      );
      setPreview(loaded);
      setPreviewError(undefined);
    } catch (error) {
      setPreview(undefined);
      setPreviewError(
        error instanceof ControlApiError
          ? error.message
          : intl.formatMessage(messages.promotionNoPlanYet),
      );
    }
  }, [api, organizationAlias, tournamentAlias, stageNumber, zoneNumber, intl]);

  // Mount-time load intentionally does not call `loadPreview` (kept for the
  // imperative re-fetch after `savePlan`): its setState calls sit directly
  // in an async/await body, which react-hooks/set-state-in-effect flags
  // when reachable from an effect. Nesting them inside a promise chain
  // instead keeps them out of that static reachability check — the same
  // pattern already used by RolesPermissionsRoute.tsx.
  useEffect(() => {
    let live = true;
    const fetchPromotionPreview = api.fetchPromotionPreview;
    if (!fetchPromotionPreview) {
      return undefined;
    }
    fetchPromotionPreview(organizationAlias, tournamentAlias, stageNumber, zoneNumber)
      .then((loaded) => {
        if (!live) return;
        setPreview(loaded);
        setPreviewError(undefined);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setPreview(undefined);
        setPreviewError(
          error instanceof ControlApiError
            ? error.message
            : intl.formatMessage(messages.promotionNoPlanYet),
        );
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber, zoneNumber, intl]);

  function addBand(): void {
    setBands((current) => [...current, { key: nextKey(), zoneRef: '', count: '' }]);
  }
  function updateBand(key: string, patch: Partial<BandRow>): void {
    setBands((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function removeBand(key: string): void {
    setBands((current) => current.filter((row) => row.key !== key));
  }

  async function savePlan(): Promise<void> {
    if (!api.savePromotionPlan) return;
    try {
      await api.savePromotionPlan(organizationAlias, tournamentAlias, stageNumber, zoneNumber, {
        nextStageNumber: Number(nextStageNumber),
        perGroupAdvance: Number(perGroupAdvance),
        combination: { mode: 'group-order' },
        ...(bands.length > 0
          ? {
              bands: bands
                .filter((row) => row.zoneRef.trim() !== '' && row.count.trim() !== '')
                .map((row) => ({ zoneRef: row.zoneRef.trim(), count: Number(row.count) })),
            }
          : {}),
      });
      push({ severity: 'success', message: intl.formatMessage(messages.promotionPlanSaved) });
      void loadPreview();
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <p className="cl-inline-alert">{intl.formatMessage(messages.promotionLoading)}</p>;
  }

  return (
    <section aria-label={intl.formatMessage(messages.promotionSectionLabel)} style={pageStyle}>
      <header>
        <p style={metaStyle}>
          {intl.formatMessage(messages.promotionBreadcrumb, {
            tournamentAlias,
            zoneName: zone?.name ?? zoneNumber,
          })}
        </p>
        <h1 style={titleStyle}>
          <FormattedMessage {...messages.promotionTitle} />
        </h1>
      </header>

      <section aria-label={intl.formatMessage(messages.promotionConfigHeading)} style={panelStyle}>
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.promotionConfigHeading} />
        </h2>
        <div style={formRowStyle}>
          <label style={labelStyle}>
            <FormattedMessage {...messages.promotionNextStageNumber} />
            <input
              aria-label={intl.formatMessage(messages.promotionNextStageNumber)}
              min="1"
              onChange={(event) => setNextStageNumber(event.target.value)}
              style={inputStyle}
              type="number"
              value={nextStageNumber}
            />
          </label>
          <label style={labelStyle}>
            <FormattedMessage {...messages.promotionPerGroupAdvance} />
            <input
              aria-label={intl.formatMessage(messages.promotionPerGroupAdvance)}
              min="1"
              onChange={(event) => setPerGroupAdvance(event.target.value)}
              style={inputStyle}
              type="number"
              value={perGroupAdvance}
            />
          </label>
        </div>

        <div>
          <h3 style={subheadingStyle}>
            <FormattedMessage {...messages.promotionBandsHeading} />
          </h3>
          <ul style={listStyle}>
            {bands.map((row) => (
              <li key={row.key} style={rowStyle}>
                <input
                  aria-label={intl.formatMessage(messages.promotionBandZoneRef)}
                  onChange={(event) => updateBand(row.key, { zoneRef: event.target.value })}
                  placeholder={intl.formatMessage(messages.promotionBandZoneRef)}
                  style={inputStyle}
                  value={row.zoneRef}
                />
                <input
                  aria-label={intl.formatMessage(messages.promotionBandCount)}
                  min="1"
                  onChange={(event) => updateBand(row.key, { count: event.target.value })}
                  style={numberInputStyle}
                  type="number"
                  value={row.count}
                />
                <Button onClick={() => removeBand(row.key)} type="button" variant="secondary">
                  <FormattedMessage {...messages.promotionRemoveBand} />
                </Button>
              </li>
            ))}
          </ul>
          <Button onClick={addBand} type="button" variant="secondary">
            <FormattedMessage {...messages.promotionAddBand} />
          </Button>
        </div>

        <Button onClick={() => void savePlan()} type="button">
          <FormattedMessage {...messages.promotionSavePlan} />
        </Button>
      </section>

      <section aria-label={intl.formatMessage(messages.promotionReviewHeading)} style={panelStyle}>
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.promotionReviewHeading} />
        </h2>
        {previewError && (
          <p className="cl-inline-alert" role="alert">
            {previewError}
          </p>
        )}
        {preview && !previewError && (
          <>
            <ol style={listStyle}>
              {preview.combined.map((entrant, index) => (
                <li key={entrant.entrantId} style={rowStyle}>
                  <strong>{index + 1}.</strong> {entrant.entrantId.slice(-8)}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </section>
  );
}

const pageStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-5)' };
const metaStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  margin: 0,
};
const titleStyle: React.CSSProperties = {
  margin: 'var(--cl-space-1) 0 0',
  fontFamily: 'var(--cl-font-display)',
};
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-4)',
  background: 'var(--cl-surface-panel)',
  display: 'grid',
  gap: 'var(--cl-space-3)',
};
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontFamily: 'var(--cl-font-display)' };
const subheadingStyle: React.CSSProperties = {
  margin: '0 0 var(--cl-space-2)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: 'var(--cl-font-size-sm)',
  color: 'var(--cl-text-muted)',
};
const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  color: 'var(--cl-text-secondary)',
};
const inputStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 'var(--cl-space-2)',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-base)',
  color: 'inherit',
};
const numberInputStyle: React.CSSProperties = { width: '5rem' };
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-2)',
};
