import { DomainError } from '../errors.js';
import { UuidV7 } from '../identifiers/uuid-v7.js';
import { err, ok, type Result } from '../result.js';
import { epochOfWallClockOrNext, wallClockOf } from './zoned-time.js';

export interface Schedule {
  readonly scheduleId: string;
  readonly organizationId: string;
  readonly name: string;
  /** Epoch milliseconds. */
  readonly startsAt: number;
  /** Epoch milliseconds. */
  readonly endsAt: number;
  readonly slotMinutes: number;
  readonly turnaroundMinutes: number;
  readonly venueIds: readonly string[];
}

export interface ScheduleSlot {
  readonly slotId: string;
  readonly scheduleId: string;
  readonly venueId: string;
  /** Epoch milliseconds. */
  readonly startsAt: number;
}

export class ScheduleError extends DomainError {
  readonly code = 'SCHEDULE_INVALID';
}

export function computeSlotCountPerVenue(
  startsAt: number,
  endsAt: number,
  slotMinutes: number,
  turnaroundMinutes: number,
): number {
  if (endsAt <= startsAt || slotMinutes <= 0 || turnaroundMinutes < 0) {
    return 0;
  }
  const totalDurationMinutes = (endsAt - startsAt) / 60_000;
  if (totalDurationMinutes < slotMinutes) {
    return 0;
  }
  return Math.floor((totalDurationMinutes + turnaroundMinutes) / (slotMinutes + turnaroundMinutes));
}

export function generateScheduleSlots(
  schedule: Pick<
    Schedule,
    'scheduleId' | 'startsAt' | 'endsAt' | 'slotMinutes' | 'turnaroundMinutes' | 'venueIds'
  >,
  idGenerator: () => string = () => UuidV7.generate().value,
  /**
   * The organization's IANA zone. Slots step in its local wall-clock minutes, so a schedule
   * crossing a daylight-saving change keeps every slot's local start time; omitted, they step
   * in plain instants, which is the same thing in a zone without daylight saving.
   */
  timeZone?: string,
): readonly ScheduleSlot[] {
  const toWall = (epoch: number) => (timeZone === undefined ? epoch : wallClockOf(epoch, timeZone));
  const fromWall = (wall: number) =>
    timeZone === undefined ? wall : epochOfWallClockOrNext(wall, timeZone);
  const firstWall = toWall(schedule.startsAt);
  const count = computeSlotCountPerVenue(
    firstWall,
    toWall(schedule.endsAt),
    schedule.slotMinutes,
    schedule.turnaroundMinutes,
  );
  if (count === 0 || schedule.venueIds.length === 0) {
    return [];
  }

  const stepMs = (schedule.slotMinutes + schedule.turnaroundMinutes) * 60_000;
  const slots: ScheduleSlot[] = [];

  for (let i = 0; i < count; i++) {
    const slotStartsAt = fromWall(firstWall + i * stepMs);
    for (const venueId of schedule.venueIds) {
      slots.push({
        slotId: idGenerator(),
        scheduleId: schedule.scheduleId,
        venueId,
        startsAt: slotStartsAt,
      });
    }
  }

  return slots;
}

export function validateSchedule(schedule: Schedule): Result<Schedule, ScheduleError> {
  if (schedule.name.trim() === '') {
    return err(new ScheduleError('A schedule needs a name', { scheduleId: schedule.scheduleId }));
  }
  if (!Number.isFinite(schedule.startsAt) || !Number.isInteger(schedule.startsAt)) {
    return err(
      new ScheduleError('A schedule starts at an epoch in milliseconds', {
        startsAt: schedule.startsAt,
      }),
    );
  }
  if (!Number.isFinite(schedule.endsAt) || !Number.isInteger(schedule.endsAt)) {
    return err(
      new ScheduleError('A schedule ends at an epoch in milliseconds', {
        endsAt: schedule.endsAt,
      }),
    );
  }
  if (schedule.endsAt <= schedule.startsAt) {
    return err(
      new ScheduleError('A schedule must end after it starts', {
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
      }),
    );
  }
  if (!Number.isFinite(schedule.slotMinutes) || schedule.slotMinutes <= 0) {
    return err(
      new ScheduleError(
        `A schedule slot lasts a positive number of minutes, not ${schedule.slotMinutes}`,
        { slotMinutes: schedule.slotMinutes },
      ),
    );
  }
  if (!Number.isFinite(schedule.turnaroundMinutes) || schedule.turnaroundMinutes < 0) {
    return err(
      new ScheduleError(
        `A schedule turnaround must be non-negative minutes, not ${schedule.turnaroundMinutes}`,
        { turnaroundMinutes: schedule.turnaroundMinutes },
      ),
    );
  }
  if (schedule.venueIds.length === 0) {
    return err(
      new ScheduleError('A schedule naming no venue generates nothing and is refused', {
        scheduleId: schedule.scheduleId,
      }),
    );
  }
  return ok(schedule);
}
