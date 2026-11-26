import { formatPenaltyClock, penaltySnapshotKey } from './penalty-countdown.js';

describe('formatPenaltyClock', () => {
  it('formats remaining seconds as MM:SS', () => {
    expect(formatPenaltyClock(120)).toBe('02:00');
    expect(formatPenaltyClock(65)).toBe('01:05');
    expect(formatPenaltyClock(9)).toBe('00:09');
  });
});

describe('penaltySnapshotKey', () => {
  it('changes when the penalty set or its remaining time changes', () => {
    const penalty = { timerId: 't1', entrantId: 'e1', remainingSeconds: 120 };
    expect(penaltySnapshotKey([penalty])).toBe('t1:120');
    expect(penaltySnapshotKey([{ ...penalty, remainingSeconds: 90 }])).not.toBe(
      penaltySnapshotKey([penalty]),
    );
    expect(penaltySnapshotKey([])).toBe('');
  });
});
