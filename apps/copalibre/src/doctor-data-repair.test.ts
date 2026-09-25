import { jest } from '@jest/globals';
import { runInteractiveRepair, type Prompter, type RepairActions } from './doctor-data-repair.js';
import type { DataIntegritySnapshot } from './doctor-data.js';

const EMPTY_SNAPSHOT: DataIntegritySnapshot = { invalidStatusTournaments: [] };

function fakePrompter(overrides: Partial<Prompter> = {}): Prompter {
  return {
    isInteractive: true,
    select: jest.fn(async () => undefined) as unknown as Prompter['select'],
    confirm: jest.fn(async () => false),
    close: jest.fn(),
    ...overrides,
  };
}

function fakeActions(overrides: Partial<RepairActions> = {}): RepairActions {
  return {
    repairTournamentStatus: jest.fn(async () => ({
      kind: 'tournament-status',
      entityId: 'unused',
      auditId: 'unused',
    })) as unknown as RepairActions['repairTournamentStatus'],
    ...overrides,
  };
}

describe('runInteractiveRepair', () => {
  it('applies nothing and reports the TTY requirement when the prompter is not interactive', async () => {
    const log = jest.fn();
    const applied = await runInteractiveRepair(
      {
        ...EMPTY_SNAPSHOT,
        invalidStatusTournaments: [
          { tournamentId: 't-1', organizationId: 'org-1', name: 'Apertura', status: 'completed' },
        ],
      },
      fakePrompter({ isInteractive: false }),
      fakeActions(),
      log,
    );
    expect(applied).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('requires an interactive terminal'));
  });

  it('applies the repair once the operator selects a status and confirms', async () => {
    const repairTournamentStatus = jest.fn(async () => ({
      kind: 'tournament-status' as const,
      entityId: 't-1',
      auditId: 'audit-1',
    }));
    const log = jest.fn();
    const applied = await runInteractiveRepair(
      {
        ...EMPTY_SNAPSHOT,
        invalidStatusTournaments: [
          { tournamentId: 't-1', organizationId: 'org-1', name: 'Apertura', status: 'completed' },
        ],
      },
      fakePrompter({
        select: jest.fn(async () => 'finished') as unknown as Prompter['select'],
        confirm: jest.fn(async () => true),
      }),
      fakeActions({
        repairTournamentStatus:
          repairTournamentStatus as unknown as RepairActions['repairTournamentStatus'],
      }),
      log,
    );
    expect(applied).toBe(1);
    expect(repairTournamentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 't-1' }),
      'finished',
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("status -> 'finished'"));
  });

  it('skips without repairing when the operator declines the selection prompt', async () => {
    const repairTournamentStatus = jest.fn();
    const applied = await runInteractiveRepair(
      {
        ...EMPTY_SNAPSHOT,
        invalidStatusTournaments: [
          { tournamentId: 't-1', organizationId: 'org-1', name: 'Apertura', status: 'completed' },
        ],
      },
      fakePrompter({ select: jest.fn(async () => undefined) as unknown as Prompter['select'] }),
      fakeActions({
        repairTournamentStatus:
          repairTournamentStatus as unknown as RepairActions['repairTournamentStatus'],
      }),
      jest.fn(),
    );
    expect(applied).toBe(0);
    expect(repairTournamentStatus).not.toHaveBeenCalled();
  });

  it('skips without repairing when the operator declines the confirmation prompt', async () => {
    const repairTournamentStatus = jest.fn();
    const applied = await runInteractiveRepair(
      {
        ...EMPTY_SNAPSHOT,
        invalidStatusTournaments: [
          { tournamentId: 't-1', organizationId: 'org-1', name: 'Apertura', status: 'completed' },
        ],
      },
      fakePrompter({
        select: jest.fn(async () => 'finished') as unknown as Prompter['select'],
        confirm: jest.fn(async () => false),
      }),
      fakeActions({
        repairTournamentStatus:
          repairTournamentStatus as unknown as RepairActions['repairTournamentStatus'],
      }),
      jest.fn(),
    );
    expect(applied).toBe(0);
    expect(repairTournamentStatus).not.toHaveBeenCalled();
  });

  it('walks multiple anomalies independently, applying only the confirmed ones', async () => {
    const repairTournamentStatus = jest.fn(async () => ({
      kind: 'tournament-status' as const,
      entityId: 'unused',
      auditId: 'unused',
    }));
    const select = jest
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce('finished')
      .mockResolvedValueOnce('archived') as unknown as Prompter['select'];
    const confirm = jest
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const applied = await runInteractiveRepair(
      {
        invalidStatusTournaments: [
          { tournamentId: 't-1', organizationId: 'org-1', name: 'Apertura', status: 'completed' },
          { tournamentId: 't-2', organizationId: 'org-1', name: 'Clausura', status: 'ongoing' },
        ],
      },
      fakePrompter({ select, confirm }),
      fakeActions({
        repairTournamentStatus:
          repairTournamentStatus as unknown as RepairActions['repairTournamentStatus'],
      }),
      jest.fn(),
    );
    expect(applied).toBe(1);
    expect(repairTournamentStatus).toHaveBeenCalledTimes(1);
    expect(repairTournamentStatus).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: 't-1' }),
      'finished',
    );
  });
});
