import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { type DashboardModel } from '../lib/dashboard.js';
import { controlTokenStore } from '../session/token-store.js';
import { ControlShell } from './ControlShell.js';
import { Button } from './ui/atoms/button.js';
import { Checkbox } from './ui/atoms/checkbox.js';
import { Label } from './ui/atoms/label.js';
import { FieldSet } from './ui/molecules/field-set.js';
import { Modal } from './ui/organisms/modal.js';
import { useResilientRead } from './pages/use-resilient-read.js';
import { useToast } from './ToastProvider.js';
import { DashboardTemplate } from './screens/DashboardTemplate.js';

interface TournamentPublishPreview {
  readonly alias: string;
  readonly name: string;
  readonly includesMinors: boolean;
  readonly showYouthProfiles: boolean;
  readonly privacyChanged: boolean;
}

/** A1, the organization dashboard. */
export function Dashboard({
  canCreateTournament,
  canManageDisplayTokens,
  canManageTournamentLifecycle,
  failed = false,
  loading = false,
  model,
  onRetry = () => undefined,
  organizationAlias,
  staleSince = undefined,
  client,
  onPublishComplete = () => undefined,
}: {
  readonly canCreateTournament: boolean;
  readonly canManageDisplayTokens: boolean;
  readonly canManageTournamentLifecycle: boolean;
  readonly failed?: boolean;
  readonly loading?: boolean;
  readonly client?: ControlApiClient;
  readonly model: DashboardModel;
  readonly onRetry?: () => void;
  readonly organizationAlias: string;
  readonly staleSince?: number;
  readonly onPublishComplete?: () => void;
}): React.JSX.Element {
  return (
    <ControlShell
      active="tournaments"
      client={client}
      helpPath="overview"
      organizationAlias={organizationAlias}
    >
      <DashboardContent
        canCreateTournament={canCreateTournament}
        canManageDisplayTokens={canManageDisplayTokens}
        canManageTournamentLifecycle={canManageTournamentLifecycle}
        client={client}
        failed={failed}
        loading={loading}
        model={model}
        onRetry={onRetry}
        onPublishComplete={onPublishComplete}
        organizationAlias={organizationAlias}
        staleSince={staleSince}
      />
    </ControlShell>
  );
}

/**
 * Fetches and mutates: the device-heartbeat poll
 * and the archive/export mutations live here; `DashboardTemplate` composes
 * the screen from the resulting data and callbacks, with no API client
 * reference of its own.
 */
function DashboardContent({
  canCreateTournament,
  canManageDisplayTokens,
  canManageTournamentLifecycle,
  failed,
  loading,
  model,
  onRetry,
  organizationAlias,
  staleSince,
  client,
  onPublishComplete,
}: {
  readonly canCreateTournament: boolean;
  readonly canManageDisplayTokens: boolean;
  readonly canManageTournamentLifecycle: boolean;
  readonly failed: boolean;
  readonly loading: boolean;
  readonly client?: ControlApiClient;
  readonly model: DashboardModel;
  readonly onRetry: () => void;
  readonly organizationAlias: string;
  readonly staleSince: number | undefined;
  readonly onPublishComplete: () => void;
}): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const api =
    client ??
    createControlApiClient({
      fetch: globalThis.fetch.bind(globalThis),
      accessToken: () => controlTokenStore.read(),
    });
  const [participantExport, setParticipantExport] = useState<
    | {
        readonly tournamentAlias: string;
        readonly includeName: boolean;
        readonly includeId: boolean;
      }
    | undefined
  >(undefined);
  const participantExportTrigger = useRef<HTMLElement | null>(null);
  const [publishPreview, setPublishPreview] = useState<TournamentPublishPreview>();
  const [publishBusy, setPublishBusy] = useState(false);
  const [participantExportBusy, setParticipantExportBusy] = useState(false);
  useEffect(() => {
    if (participantExport === undefined && participantExportTrigger.current !== null) {
      participantExportTrigger.current.focus();
      participantExportTrigger.current = null;
    }
  }, [participantExport]);
  function download(
    tournamentAlias: string,
    kind: 'participants/individual' | 'participants/team' | 'results' | 'standings',
    excludedPersonalColumns: readonly ('displayName' | 'naturalKeyKind' | 'naturalKey')[] = [],
  ): Promise<boolean> {
    return (async () => {
      try {
        if (!api.downloadCsvExport) throw new Error('CSV export is unavailable');
        const csv = await api.downloadCsvExport(
          organizationAlias,
          tournamentAlias,
          kind,
          excludedPersonalColumns,
        );
        if (csv === undefined) throw new Error('CSV export returned no file');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        link.download = `${tournamentAlias}-${kind.replace('/', '-')}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        return true;
      } catch {
        push({ severity: 'error', message: intl.formatMessage(messages.dashboardExportFailed) });
        return false;
      }
    })();
  }
  function requestExport(
    tournamentAlias: string,
    kind: 'participants/individual' | 'participants/team' | 'results' | 'standings',
    trigger?: HTMLElement | null,
  ): void {
    if (kind === 'participants/individual') {
      participantExportTrigger.current = trigger ?? null;
      setParticipantExport({ tournamentAlias, includeName: true, includeId: false });
      return;
    }
    void download(tournamentAlias, kind);
  }
  async function confirmParticipantExport(): Promise<void> {
    if (!participantExport) return;
    const excluded: ('displayName' | 'naturalKeyKind' | 'naturalKey')[] = [
      ...(participantExport.includeName ? [] : ['displayName' as const]),
      ...(participantExport.includeId ? [] : (['naturalKeyKind', 'naturalKey'] as const)),
    ];
    setParticipantExportBusy(true);
    try {
      if (await download(participantExport.tournamentAlias, 'participants/individual', excluded)) {
        setParticipantExport(undefined);
      }
    } finally {
      setParticipantExportBusy(false);
    }
  }
  function downloadConfiguration(tournamentAlias: string): void {
    void api
      .downloadTournamentConfiguration?.(organizationAlias, tournamentAlias)
      .then((configuration) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(
          new Blob([`${JSON.stringify(configuration, null, 2)}\n`], { type: 'application/json' }),
        );
        link.download = `${tournamentAlias}-configuration.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
  }

  async function previewPublication(
    tournamentAlias: string,
    tournamentName: string,
  ): Promise<void> {
    if (!api.fetchTournamentSettings) {
      pushError(new Error(intl.formatMessage(messages.dashboardPublishUnavailable)));
      return;
    }
    setPublishBusy(true);
    try {
      const settings = await api.fetchTournamentSettings(organizationAlias, tournamentAlias);
      setPublishPreview({
        alias: tournamentAlias,
        name: tournamentName,
        includesMinors: settings.includesMinors,
        showYouthProfiles: settings.showYouthProfiles,
        privacyChanged: false,
      });
    } catch (error) {
      pushError(error);
    } finally {
      setPublishBusy(false);
    }
  }

  async function confirmPublication(): Promise<void> {
    if (publishPreview === undefined) return;
    if (!api.fetchTournamentSettings || !api.publishTournament) {
      pushError(new Error(intl.formatMessage(messages.dashboardPublishUnavailable)));
      return;
    }
    setPublishBusy(true);
    try {
      const currentSettings = await api.fetchTournamentSettings(
        organizationAlias,
        publishPreview.alias,
      );
      if (
        currentSettings.includesMinors !== publishPreview.includesMinors ||
        currentSettings.showYouthProfiles !== publishPreview.showYouthProfiles
      ) {
        setPublishPreview({
          ...publishPreview,
          includesMinors: currentSettings.includesMinors,
          showYouthProfiles: currentSettings.showYouthProfiles,
          privacyChanged: true,
        });
        return;
      }
      await api.publishTournament(organizationAlias, publishPreview.alias);
      setPublishPreview(undefined);
      push({ severity: 'success', message: intl.formatMessage(messages.dashboardPublishSuccess) });
      onPublishComplete();
    } catch (error) {
      pushError(error);
    } finally {
      setPublishBusy(false);
    }
  }

  const [now, setNow] = useState(() => Date.now());
  const [archivedAliases, setArchivedAliases] = useState<ReadonlySet<string>>(new Set());

  const visibleTournaments = model.tournaments.filter((card) => !archivedAliases.has(card.alias));
  function archive(tournamentAlias: string): void {
    void api.archiveTournament?.(organizationAlias, tournamentAlias).then(() => {
      setArchivedAliases((current) => new Set([...current, tournamentAlias]));
    });
  }
  const tournamentAliases = model.tournaments.map((card) => card.alias).join(',');
  const deviceRead = useResilientRead(
    `control-dashboard-devices:${organizationAlias}:${tournamentAliases}`,
    async () => {
      const byTournament = await Promise.all(
        model.tournaments.map(async (card) => {
          const tokens = (await api.listDisplayTokens?.(organizationAlias, card.alias)) ?? [];
          return tokens.map((token) => ({ tournamentName: card.name, token }));
        }),
      );
      return byTournament.flat();
    },
    {
      thing: intl.formatMessage(messages.navDashboard),
      isEmpty: (devices) => devices.length === 0,
    },
  );
  const devices = deviceRead.data ?? [];
  const retryDevices = deviceRead.retry;

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      retryDevices();
    }, 15_000);
    return () => {
      clearInterval(interval);
    };
  }, [retryDevices, tournamentAliases]);

  const visibleModel: DashboardModel = { ...model, tournaments: visibleTournaments };

  return (
    <>
      <DashboardTemplate
        canCreateTournament={canCreateTournament}
        canManageDisplayTokens={canManageDisplayTokens}
        canManageTournamentLifecycle={canManageTournamentLifecycle}
        devices={devices}
        failed={failed}
        loading={loading}
        model={visibleModel}
        now={now}
        onArchive={archive}
        onExport={requestExport}
        onExportConfiguration={downloadConfiguration}
        onPublish={(tournamentAlias, tournamentName) =>
          void previewPublication(tournamentAlias, tournamentName)
        }
        onRetry={onRetry}
        organizationAlias={organizationAlias}
        staleSince={
          staleSince ?? (deviceRead.status === 'stale' ? deviceRead.staleSince : undefined)
        }
      />
      <Modal
        closeLabel={intl.formatMessage(messages.registrationModalClose)}
        description={intl.formatMessage(messages.dashboardExportColumnsIntro)}
        footer={
          <>
            <Button
              disabled={participantExportBusy}
              onClick={() => setParticipantExport(undefined)}
              type="button"
              variant="secondary"
            >
              {intl.formatMessage(messages.dashboardExportColumnsCancel)}
            </Button>
            <Button
              disabled={participantExportBusy}
              onClick={() => void confirmParticipantExport()}
              type="button"
            >
              {intl.formatMessage(messages.dashboardExportColumnsDownload)}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !participantExportBusy) setParticipantExport(undefined);
        }}
        open={participantExport !== undefined}
        title={intl.formatMessage(messages.dashboardExportColumnsTitle)}
      >
        <FieldSet legend={intl.formatMessage(messages.dashboardExportColumnsTitle)}>
          <Label className="cl-toggle cl-focusable">
            <Checkbox
              checked={participantExport?.includeName ?? false}
              onCheckedChange={(checked) =>
                setParticipantExport((current) =>
                  current === undefined ? current : { ...current, includeName: checked },
                )
              }
            />
            <span>{intl.formatMessage(messages.dashboardExportColumnName)}</span>
          </Label>
          <Label className="cl-toggle cl-focusable">
            <Checkbox
              checked={participantExport?.includeId ?? false}
              onCheckedChange={(checked) =>
                setParticipantExport((current) =>
                  current === undefined ? current : { ...current, includeId: checked },
                )
              }
            />
            <span>{intl.formatMessage(messages.dashboardExportColumnIdentityDocument)}</span>
          </Label>
        </FieldSet>
      </Modal>
      <Modal
        closeLabel={intl.formatMessage(messages.registrationModalClose)}
        description={intl.formatMessage(messages.dashboardPublishIntro)}
        footer={
          <>
            <Button
              disabled={publishBusy}
              onClick={() => setPublishPreview(undefined)}
              type="button"
              variant="secondary"
            >
              {intl.formatMessage(messages.dashboardPublishCancel)}
            </Button>
            <Button disabled={publishBusy} onClick={() => void confirmPublication()} type="button">
              {intl.formatMessage(messages.dashboardPublishAction)}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!open && !publishBusy) setPublishPreview(undefined);
        }}
        open={publishPreview !== undefined}
        title={intl.formatMessage(messages.dashboardPublishTitle, {
          name: publishPreview?.name ?? '',
        })}
      >
        {publishPreview !== undefined && (
          <>
            {publishPreview.privacyChanged && (
              <p role="status">{intl.formatMessage(messages.dashboardPublishPrivacyChanged)}</p>
            )}
            <ul>
              <li>{intl.formatMessage(messages.dashboardPublishOverview)}</li>
              <li>{intl.formatMessage(messages.dashboardPublishMatches)}</li>
              <li>{intl.formatMessage(messages.dashboardPublishStandings)}</li>
              <li>{intl.formatMessage(messages.dashboardPublishSchedule)}</li>
            </ul>
            <p>
              {intl.formatMessage(
                publishPreview.includesMinors && !publishPreview.showYouthProfiles
                  ? messages.dashboardPublishYouthHidden
                  : publishPreview.includesMinors
                    ? messages.dashboardPublishYouthProfilesVisible
                    : messages.dashboardPublishProfilesVisible,
              )}
            </p>
            <a
              className="cl-focusable"
              href={`/control/${organizationAlias}/tournaments/${publishPreview.alias}/settings#privacy`}
              onClick={controlLinkClick(
                `/control/${organizationAlias}/tournaments/${publishPreview.alias}/settings#privacy`,
              )}
            >
              {intl.formatMessage(messages.dashboardPublishReviewPrivacy)}
            </a>
          </>
        )}
      </Modal>
    </>
  );
}
