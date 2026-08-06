import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import {
  createControlApiClient,
  type ConsoleEventDefinition,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
} from '../lib/api-client.js';
import {
  currentEpochMilliseconds,
  descriptionFor,
  formatClock,
  isEventPermitted,
  newIdempotencyKey,
  segmentLabel,
} from '../lib/match-console.js';
import { Button } from './ui/button.js';

const RECONCILIATION_TIMEOUT_MS = 8_000;

export function MatchConsoleRoute({
  organizationAlias,
  tournamentAlias,
  matchId,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly client?: MatchConsoleApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [projection, setProjection] = useState<MatchConsoleResponse>();
  const [status, setStatus] = useState('Cargando control de partido...');
  const [stale, setStale] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeIdempotencyKey, setFinalizeIdempotencyKey] = useState<string>();
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState('0');
  const [selectedSide, setSelectedSide] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [conditionalEvent, setConditionalEvent] = useState<ConsoleEventDefinition>();
  const [description, setDescription] = useState('');
  const [eventCategory, setEventCategory] = useState<'all' | 'positive' | 'negative' | 'neutral'>(
    'all',
  );
  const [logNote, setLogNote] = useState('');
  const projectionVersion = useRef(0);
  const finalizationInFlight = useRef(false);

  const reload = useCallback(
    (): Promise<void> =>
      api
        .fetchMatchConsole(organizationAlias, tournamentAlias, matchId)
        .then((loaded) => {
          setProjection(loaded);
          projectionVersion.current = loaded.projectionVersion;
          setSelectedSegmentId(
            (current) =>
              current ||
              loaded.segments.find((one) => one.state === 'active')?.segmentId ||
              loaded.segments[0]?.segmentId ||
              '',
          );
          setSelectedSide((current) => current || loaded.entrantIds[0] || '');
          setSelectedPersonId((current) => current || loaded.eligiblePersonIds[0] || '');
          setSelectedStaffId((current) => current || loaded.eligibleStaffIds[0] || '');
          setStatus('');
          setStale(false);
        })
        .catch(() => setStatus('No se pudo cargar el estado autoritativo del partido.')),
    [api, matchId, organizationAlias, tournamentAlias],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const stream = api.matchConsoleStream?.(organizationAlias);
    if (!stream) return undefined;

    const realtime = new RealtimeClient({
      url: stream.url,
      accessToken: stream.accessToken,
      heartbeatTimeoutMs: RECONCILIATION_TIMEOUT_MS,
    });
    void realtime.connect({
      onEvent: (event) => {
        if (
          event.eventType === 'match.console-projection' &&
          event.entityId === matchId &&
          event.projectionVersion > projectionVersion.current
        ) {
          void reload();
        }
      },
      onProjectionRequired: () => void reload(),
      onFailure: () => setStale(true),
    });
    return () => realtime.close();
  }, [api, matchId, organizationAlias, reload]);

  useEffect(() => {
    if (!stale) return undefined;
    const timeout = globalThis.setTimeout(() => void reload(), RECONCILIATION_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeout);
  }, [reload, stale]);

  if (!projection) return <p className="cl-inline-alert">{status}</p>;

  const activeSegment = projection.segments.find((segment) => segment.state === 'active');
  const permittedEvents = projection.eventDefinitions.filter((definition) =>
    isEventPermitted(definition, projection, activeSegment),
  );
  const canRecord = projection.capabilities.includes('match.record-event');
  const canControlClock = projection.capabilities.includes('match.control-clock');
  const canResolveTimer = projection.capabilities.includes('match.resolve-timer');
  const canFinalize = projection.capabilities.includes('match.finalize');
  const displayedEvents = projection.events.filter((event) => {
    if (eventCategory === 'all') return true;
    return (
      projection.eventDefinitions.find((definition) => definition.code === event.definitionCode)
        ?.category === eventCategory
    );
  });

  async function mutate(work: () => Promise<unknown>, optimistic?: () => void): Promise<void> {
    setStale(true);
    optimistic?.();
    try {
      await work();
      await reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'La operación fue rechazada.');
    }
  }

  function record(definition: ConsoleEventDefinition): void {
    if (!activeSegment) return;
    if (definition.workflow) {
      setConditionalEvent(definition);
      return;
    }
    recordFinal(definition);
  }

  function recordFinal(definition: ConsoleEventDefinition): void {
    if (!activeSegment) return;
    const occurredAt = currentEpochMilliseconds();
    const payloadDescription = descriptionFor(definition, description);
    void mutate(
      () =>
        api.recordMatchEvent(organizationAlias, tournamentAlias, matchId, {
          definitionCode: definition.code,
          segmentId: activeSegment.segmentId,
          occurredAt,
          ...(definition.actorRequirement === 'none' ? {} : { side: selectedSide }),
          ...(definition.actorRequirement === 'person' ||
          definition.actorRequirement === 'person-or-staff'
            ? { personId: selectedPersonId || selectedStaffId }
            : {}),
          ...(payloadDescription === undefined
            ? {}
            : { payload: { description: payloadDescription } }),
        }),
      () =>
        setProjection((current) =>
          current
            ? {
                ...current,
                events: [
                  ...current.events,
                  {
                    eventId: `pending-${occurredAt}`,
                    definitionCode: definition.code,
                    segmentId: activeSegment.segmentId,
                    sequence: current.events.length + 1,
                    occurredAt: new Date(occurredAt).toISOString(),
                    ...(definition.actorRequirement === 'none' ? {} : { side: selectedSide }),
                    ...(definition.actorRequirement === 'person' ||
                    definition.actorRequirement === 'person-or-staff'
                      ? { personId: selectedPersonId || selectedStaffId }
                      : {}),
                  },
                ],
              }
            : current,
        ),
    );
    setConditionalEvent(undefined);
    setDescription('');
  }

  async function finalize(): Promise<void> {
    if (!projection || finalizationInFlight.current) return;
    finalizationInFlight.current = true;
    const current = projection;
    const idempotencyKey = finalizeIdempotencyKey ?? newIdempotencyKey();
    setFinalizeIdempotencyKey(idempotencyKey);
    setFinalizing(true);
    try {
      await api.finalizeMatch(
        organizationAlias,
        tournamentAlias,
        matchId,
        {
          sides: current.entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
          ...(selectedSide ? { winnerEntrantId: selectedSide } : {}),
        },
        idempotencyKey,
      );
      await reload();
      setConfirmingFinalize(false);
      setFinalizeIdempotencyKey(undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'La finalización no pudo confirmarse.');
    } finally {
      finalizationInFlight.current = false;
      setFinalizing(false);
    }
  }

  return (
    <section aria-label="Operar partido" style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={metaStyle}>
            {tournamentAlias} / Partido {matchId.slice(-8)}
          </p>
          <h1 style={titleStyle}>Operaciones de partido</h1>
        </div>
        <div style={statusStyle}>
          <strong>
            {projection.status === 'in-progress' ? 'EN VIVO' : projection.status.toUpperCase()}
          </strong>
          <ClockRing
            elapsedSeconds={activeSegment?.elapsedSeconds ?? 0}
            durationSeconds={activeSegment?.durationSeconds}
          />
        </div>
      </header>

      {status && <p className="cl-inline-alert">{status}</p>}
      {stale && <p className="cl-inline-alert">Esperando proyección autoritativa...</p>}

      <div style={workspaceStyle}>
        <section aria-label="Controles del partido" style={primaryColumnStyle}>
          <section aria-label="Marcador actual" style={scoreboardStyle}>
            {projection.liveScores.map((side) => (
              <div key={side.entrantId} style={scoreSideStyle}>
                <span>{side.entrantId.slice(-8)}</span>
                <strong>{side.score}</strong>
              </div>
            ))}
          </section>
          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>Reloj y período</h2>
            <div style={controlGridStyle}>
              <label style={labelStyle}>
                Segmento
                <select
                  aria-label="Segmento activo"
                  disabled={!canControlClock}
                  onChange={(event) => setSelectedSegmentId(event.target.value)}
                  style={inputStyle}
                  value={selectedSegmentId}
                >
                  {projection.segments.map((segment) => (
                    <option key={segment.segmentId} value={segment.segmentId}>
                      {segment.type} {segment.number} · {segment.state}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Segundos transcurridos
                <input
                  aria-label="Segundos transcurridos"
                  disabled={!canControlClock}
                  min="0"
                  onChange={(event) => setElapsedSeconds(event.target.value)}
                  style={inputStyle}
                  type="number"
                  value={elapsedSeconds}
                />
              </label>
              <Button
                disabled={!canControlClock || selectedSegmentId === ''}
                onClick={() =>
                  void mutate(
                    () =>
                      api.adjustMatchClock(organizationAlias, tournamentAlias, matchId, {
                        segmentId: selectedSegmentId,
                        elapsedSeconds: Number(elapsedSeconds),
                        activate: true,
                      }),
                    () =>
                      setProjection((current) =>
                        current
                          ? {
                              ...current,
                              segments: current.segments.map((segment) => ({
                                ...segment,
                                state:
                                  segment.segmentId === selectedSegmentId
                                    ? 'active'
                                    : segment.state === 'active'
                                      ? 'pending'
                                      : segment.state,
                                ...(segment.segmentId === selectedSegmentId
                                  ? { elapsedSeconds: Number(elapsedSeconds) }
                                  : {}),
                              })),
                            }
                          : current,
                      ),
                  )
                }
                type="button"
              >
                Aplicar reloj
              </Button>
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>Registrar evento</h2>
            <div style={attributionStyle}>
              <label style={labelStyle}>
                Participante
                <select
                  aria-label="Participante del evento"
                  disabled={!canRecord}
                  onChange={(event) => setSelectedSide(event.target.value)}
                  style={inputStyle}
                  value={selectedSide}
                >
                  {projection.entrantIds.map((entrantId) => (
                    <option key={entrantId} value={entrantId}>
                      {entrantId.slice(-8)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Persona
                <select
                  aria-label="Persona del evento"
                  disabled={!canRecord || projection.eligiblePersonIds.length === 0}
                  onChange={(event) => {
                    setSelectedPersonId(event.target.value);
                    if (event.target.value) setSelectedStaffId('');
                  }}
                  style={inputStyle}
                  value={selectedPersonId}
                >
                  <option value="">Sin atribución</option>
                  {projection.eligiblePersonIds.map((personId) => (
                    <option key={personId} value={personId}>
                      {personId.slice(-8)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Staff
                <select
                  aria-label="Staff del evento"
                  disabled={!canRecord || projection.eligibleStaffIds.length === 0}
                  onChange={(event) => {
                    setSelectedStaffId(event.target.value);
                    if (event.target.value) setSelectedPersonId('');
                  }}
                  style={inputStyle}
                  value={selectedStaffId}
                >
                  <option value="">Sin atribución</option>
                  {projection.eligibleStaffIds.map((personId) => (
                    <option key={personId} value={personId}>
                      {personId.slice(-8)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={eventGridStyle}>
              {permittedEvents.map((definition) => (
                <Button
                  disabled={!canRecord}
                  key={definition.code}
                  onClick={() => record(definition)}
                  style={{ borderColor: definition.display.color }}
                  type="button"
                  variant="secondary"
                >
                  {definition.label}
                </Button>
              ))}
            </div>
            {conditionalEvent && (
              <div aria-label="Resultado del evento" style={conditionalStyle}>
                <strong>{conditionalEvent.label}</strong>
                <div style={eventGridStyle}>
                  {conditionalEvent.workflow?.options.map((option) => {
                    const finalDefinition = projection.eventDefinitions.find(
                      (definition) => definition.code === option.definitionCode,
                    );
                    if (!finalDefinition) return null;
                    return (
                      <Button
                        disabled={!canRecord}
                        key={option.definitionCode}
                        onClick={() => recordFinal(finalDefinition)}
                        type="button"
                        variant="secondary"
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            <label style={labelStyle}>
              Descripción
              <input
                aria-label="Descripción del evento"
                disabled={!canRecord}
                onChange={(event) => setDescription(event.target.value)}
                style={inputStyle}
                value={description}
              />
            </label>
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>Finalizar</h2>
            {!confirmingFinalize ? (
              <Button
                disabled={!canFinalize || projection.status !== 'in-progress'}
                onClick={() => setConfirmingFinalize(true)}
                type="button"
                variant="destructive"
              >
                Finalizar partido
              </Button>
            ) : (
              <div className="cl-inline-alert" style={confirmationStyle}>
                <strong>El resultado quedará registrado como hecho inmutable.</strong>
                <span>Las correcciones posteriores preservarán motivo e historial.</span>
                <div style={buttonRowStyle}>
                  <Button
                    onClick={() => {
                      setConfirmingFinalize(false);
                      setFinalizeIdempotencyKey(undefined);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={finalizing}
                    onClick={() => void finalize()}
                    type="button"
                    variant="destructive"
                  >
                    Confirmar finalización
                  </Button>
                </div>
              </div>
            )}
          </section>
        </section>

        <aside aria-label="Ledger y estado" style={railStyle}>
          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>Timers activos</h2>
            {projection.runningTimers.length === 0 ? (
              <p style={emptyStyle}>Sin timers activos.</p>
            ) : (
              <ul style={listStyle}>
                {projection.runningTimers.map((timer) => (
                  <li key={timer.timerId} style={listItemStyle}>
                    <span>{formatClock(timer.remainingSeconds)}</span>
                    <Button
                      disabled={!canResolveTimer}
                      onClick={() =>
                        void mutate(
                          () =>
                            api.resolveMatchTimer(
                              organizationAlias,
                              tournamentAlias,
                              matchId,
                              timer.timerId,
                            ),
                          () =>
                            setProjection((current) =>
                              current
                                ? {
                                    ...current,
                                    runningTimers: current.runningTimers.filter(
                                      (candidate) => candidate.timerId !== timer.timerId,
                                    ),
                                  }
                                : current,
                            ),
                        )
                      }
                      type="button"
                      variant="secondary"
                    >
                      Resolver
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>Event ledger</h2>
            <div style={filterRowStyle}>
              {(['all', 'positive', 'negative', 'neutral'] as const).map((category) => (
                <Button
                  aria-pressed={eventCategory === category}
                  key={category}
                  onClick={() => setEventCategory(category)}
                  type="button"
                  variant="secondary"
                >
                  {category === 'all' ? 'Todos' : category}
                </Button>
              ))}
            </div>
            <ol style={listStyle}>
              {[...displayedEvents].reverse().map((event) => (
                <li key={event.eventId} style={ledgerItemStyle}>
                  <strong>
                    {event.definitionCode} · {segmentLabel(projection, event.segmentId)}
                  </strong>
                  <span>{new Date(event.occurredAt).toLocaleTimeString('es-AR')}</span>
                </li>
              ))}
            </ol>
            <label style={labelStyle}>
              Nota de bitácora
              <textarea
                aria-label="Nota de bitácora"
                onChange={(event) => setLogNote(event.target.value)}
                placeholder=""
                style={noteStyle}
                value={logNote}
              />
            </label>
          </section>

          <section style={panelStyle}>
            <h2 style={sectionTitleStyle}>Señal operativa</h2>
            <div style={telemetryStyle}>
              {['Latencia', 'Packet loss', 'Espectadores', 'Uptime'].map((metric) => (
                <div key={metric} style={telemetryItemStyle}>
                  <span>{metric}</span>
                  <strong>Unavailable</strong>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ClockRing({
  elapsedSeconds,
  durationSeconds,
}: {
  readonly elapsedSeconds: number;
  readonly durationSeconds: number | undefined;
}): React.JSX.Element {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress =
    durationSeconds && durationSeconds > 0 ? Math.min(elapsedSeconds / durationSeconds, 1) : 0;
  return (
    <div aria-label={`Reloj ${formatClock(elapsedSeconds)}`} style={clockRingStyle}>
      <svg aria-hidden="true" height="52" viewBox="0 0 52 52" width="52">
        <circle
          cx="26"
          cy="26"
          fill="none"
          r={radius}
          stroke="var(--cl-border-muted)"
          strokeWidth="4"
        />
        <circle
          cx="26"
          cy="26"
          fill="none"
          r={radius}
          stroke="var(--cl-state-live)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          strokeWidth="4"
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span>{formatClock(elapsedSeconds)}</span>
    </div>
  );
}

const pageStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-6)' };
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'start',
  gap: 'var(--cl-space-4)',
};
const metaStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  margin: 0,
};
const titleStyle: React.CSSProperties = {
  margin: 'var(--cl-space-1) 0 0',
  fontFamily: 'var(--cl-font-display)',
};
const statusStyle: React.CSSProperties = {
  display: 'grid',
  justifyItems: 'end',
  color: 'var(--cl-state-live)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '1.25rem',
};
const clockRingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-2)',
};
const workspaceStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 0.42fr)',
  gap: 'var(--cl-space-5)',
};
const primaryColumnStyle: React.CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 'var(--cl-space-5)',
};
const railStyle: React.CSSProperties = {
  display: 'grid',
  alignContent: 'start',
  gap: 'var(--cl-space-5)',
};
const scoreboardStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-panel)',
};
const scoreSideStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-3)',
  padding: 'var(--cl-space-4)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '1.25rem',
};
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-4)',
  background: 'var(--cl-surface-panel)',
};
const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 var(--cl-space-4)',
  fontFamily: 'var(--cl-font-display)',
};
const controlGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 'var(--cl-space-3)',
  alignItems: 'end',
};
const attributionStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--cl-space-3)',
  marginBottom: 'var(--cl-space-4)',
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
const eventGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
  gap: 'var(--cl-space-2)',
};
const conditionalStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-3)',
  borderLeft: '2px solid var(--cl-state-live)',
  marginTop: 'var(--cl-space-3)',
  paddingLeft: 'var(--cl-space-3)',
};
const confirmationStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
};
const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
};
const listItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 'var(--cl-space-2)',
};
const ledgerItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--cl-space-2)',
  borderBottom: '1px solid var(--cl-border-muted)',
  paddingBottom: 'var(--cl-space-2)',
};
const filterRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
  marginBottom: 'var(--cl-space-3)',
};
const noteStyle: React.CSSProperties = {
  minHeight: '72px',
  padding: 'var(--cl-space-2)',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-base)',
  color: 'inherit',
  resize: 'vertical',
};
const emptyStyle: React.CSSProperties = { margin: 0, color: 'var(--cl-text-muted)' };
const telemetryStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--cl-space-2)',
};
const telemetryItemStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  borderLeft: '2px solid var(--cl-border-muted)',
  paddingLeft: 'var(--cl-space-2)',
  color: 'var(--cl-text-muted)',
};
