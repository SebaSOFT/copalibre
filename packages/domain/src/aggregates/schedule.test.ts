import {
  computeSlotCountPerVenue,
  generateScheduleSlots,
  validateSchedule,
  type Schedule,
} from './schedule.js';

describe('schedule grid generator', () => {
  const BASE_TIME = 1_700_000_000_000;

  it('generates 7 slots for 12 hours of 90-minute slots with 15-minute turnaround', () => {
    // 12 hours = 720 minutes
    const startsAt = BASE_TIME;
    const endsAt = BASE_TIME + 12 * 60 * 60_000;
    const count = computeSlotCountPerVenue(startsAt, endsAt, 90, 15);
    expect(count).toBe(7);

    const slots = generateScheduleSlots({
      scheduleId: 'sched-1',
      startsAt,
      endsAt,
      slotMinutes: 90,
      turnaroundMinutes: 15,
      venueIds: ['v1', 'v2', 'v3'],
    });

    // 7 slots per venue across 3 venues = 21 slots
    expect(slots).toHaveLength(21);

    // Verify first step
    const firstSlots = slots.filter((s) => s.startsAt === startsAt);
    expect(firstSlots).toHaveLength(3);
    expect(firstSlots.map((s) => s.venueId)).toEqual(['v1', 'v2', 'v3']);

    // Verify step interval is (90 + 15) * 60_000 = 105 minutes
    const stepMs = 105 * 60_000;
    const seventhStepStartsAt = startsAt + 6 * stepMs;
    const seventhSlots = slots.filter((s) => s.startsAt === seventhStepStartsAt);
    expect(seventhSlots).toHaveLength(3);

    // An 8th slot needs 8 * 90 + 7 * 15 = 825 minutes (13h 45m).
    // For 824 minutes, count is still 7:
    const count824 = computeSlotCountPerVenue(startsAt, startsAt + 824 * 60_000, 90, 15);
    expect(count824).toBe(7);

    // At 825 minutes, count becomes 8:
    const count825 = computeSlotCountPerVenue(startsAt, startsAt + 825 * 60_000, 90, 15);
    expect(count825).toBe(8);
  });

  it('handles zero turnaround minutes', () => {
    const startsAt = BASE_TIME;
    const endsAt = BASE_TIME + 180 * 60_000; // 3 hours = 180 minutes
    const count = computeSlotCountPerVenue(startsAt, endsAt, 60, 0);
    expect(count).toBe(3);

    const slots = generateScheduleSlots({
      scheduleId: 'sched-1',
      startsAt,
      endsAt,
      slotMinutes: 60,
      turnaroundMinutes: 0,
      venueIds: ['v1'],
    });
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.startsAt)).toEqual([
      startsAt,
      startsAt + 60 * 60_000,
      startsAt + 120 * 60_000,
    ]);
  });

  it('discards a remainder too short for a slot', () => {
    const startsAt = BASE_TIME;
    // 90 min slot + 15 min turnaround + 89 min remainder = 194 min
    const endsAt = BASE_TIME + 194 * 60_000;
    const count = computeSlotCountPerVenue(startsAt, endsAt, 90, 15);
    expect(count).toBe(1);
  });

  it('returns empty array when no venues or invalid duration', () => {
    const startsAt = BASE_TIME;
    const endsAt = BASE_TIME + 60 * 60_000;
    const slots = generateScheduleSlots({
      scheduleId: 'sched-1',
      startsAt,
      endsAt,
      slotMinutes: 60,
      turnaroundMinutes: 10,
      venueIds: [],
    });
    expect(slots).toEqual([]);
  });

  describe('validateSchedule', () => {
    const validSchedule: Schedule = {
      scheduleId: 'sched-1',
      organizationId: 'org-1',
      name: 'Weekend Grid',
      startsAt: BASE_TIME,
      endsAt: BASE_TIME + 720 * 60_000,
      slotMinutes: 90,
      turnaroundMinutes: 15,
      venueIds: ['v1'],
    };

    it('accepts a valid schedule', () => {
      const result = validateSchedule(validSchedule);
      expect(result.ok).toBe(true);
    });

    it('refuses empty name', () => {
      const result = validateSchedule({ ...validSchedule, name: '   ' });
      expect(result.ok).toBe(false);
    });

    it('refuses invalid start/end times', () => {
      expect(validateSchedule({ ...validSchedule, endsAt: validSchedule.startsAt }).ok).toBe(false);
      expect(validateSchedule({ ...validSchedule, endsAt: validSchedule.startsAt - 1000 }).ok).toBe(
        false,
      );
    });

    it('refuses non-positive slotMinutes or negative turnaroundMinutes', () => {
      expect(validateSchedule({ ...validSchedule, slotMinutes: 0 }).ok).toBe(false);
      expect(validateSchedule({ ...validSchedule, slotMinutes: -10 }).ok).toBe(false);
      expect(validateSchedule({ ...validSchedule, turnaroundMinutes: -5 }).ok).toBe(false);
    });

    it('refuses empty venue list', () => {
      const result = validateSchedule({ ...validSchedule, venueIds: [] });
      expect(result.ok).toBe(false);
    });
  });
});
