import { publicIntl, tournamentStatusLineLabels } from './i18n/public-intl.js';
import { buildTournamentStatusLine } from './tournament-status-line.js';

describe('buildTournamentStatusLine', () => {
  it('names finished stages before the current stage and segments still in play', () => {
    const line = buildTournamentStatusLine(
      {
        status: 'live',
        stages: [
          {
            stageId: 's1',
            stageNumber: 1,
            stageName: 'Fase de grupos',
            totalMatches: 36,
            resolvedMatches: 36,
            segments: [{ segmentId: 'g1', name: 'Grupo A', totalMatches: 6, resolvedMatches: 6 }],
          },
          {
            stageId: 's2',
            stageNumber: 2,
            stageName: 'Copas',
            totalMatches: 36,
            resolvedMatches: 12,
            segments: [
              { segmentId: 'z1', name: 'Copa Oro', totalMatches: 12, resolvedMatches: 4 },
              { segmentId: 'z2', name: 'Copa Plata', totalMatches: 12, resolvedMatches: 4 },
              { segmentId: 'z3', name: 'Copa Bronce', totalMatches: 12, resolvedMatches: 4 },
            ],
          },
        ],
      },
      tournamentStatusLineLabels(publicIntl('es')),
    );

    expect(line).toBe(
      'Fase de grupos finalizada · Copas: 12 de 36 · Copa Oro 4/12 · Copa Plata 4/12 · Copa Bronce 4/12',
    );
  });

  it('omits already-completed segments in the current stage', () => {
    const line = buildTournamentStatusLine(
      {
        status: 'live',
        stages: [
          {
            stageId: 's1',
            stageNumber: 1,
            stageName: 'Group stage',
            totalMatches: 12,
            resolvedMatches: 9,
            segments: [
              { segmentId: 'g1', name: 'Group A', totalMatches: 6, resolvedMatches: 6 },
              { segmentId: 'g2', name: 'Group B', totalMatches: 6, resolvedMatches: 3 },
            ],
          },
        ],
      },
      tournamentStatusLineLabels(publicIntl('en')),
    );

    expect(line).toBe('Group stage: 9 of 12 · Group B 3/6');
  });

  it('returns undefined for a finished tournament or when no stage is in play', () => {
    const labels = tournamentStatusLineLabels(publicIntl('en'));
    expect(
      buildTournamentStatusLine(
        {
          status: 'finished',
          stages: [
            {
              stageId: 's1',
              stageNumber: 1,
              stageName: 'Group stage',
              totalMatches: 12,
              resolvedMatches: 12,
            },
          ],
        },
        labels,
      ),
    ).toBeUndefined();

    expect(
      buildTournamentStatusLine(
        {
          status: 'upcoming',
          stages: [
            {
              stageId: 's1',
              stageNumber: 1,
              stageName: 'Group stage',
              totalMatches: 0,
              resolvedMatches: 0,
            },
          ],
        },
        labels,
      ),
    ).toBeUndefined();
  });
});
