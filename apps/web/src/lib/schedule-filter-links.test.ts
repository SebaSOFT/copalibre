import { describe, expect, it } from '@jest/globals';
import {
  groupFilterOverrides,
  zoneFilterOverrides,
  type ScheduleFilterRow,
} from './schedule-filter-links.js';

const rows: readonly ScheduleFilterRow[] = [
  { stageNumber: 1, zoneName: 'Grupos', groupName: 'Grupo A' },
  { stageNumber: 1, zoneName: 'Grupos', groupName: 'Grupo B' },
  { stageNumber: 2, zoneName: 'Copa Oro' },
  // The zone name "Copa Plata" is reused by a second stage: a zone shared by several stages.
  { stageNumber: 2, zoneName: 'Copa Plata' },
  { stageNumber: 3, zoneName: 'Copa Plata' },
  // A group name repeated in two zones of one stage.
  { stageNumber: 2, zoneName: 'Copa Oro', groupName: 'Llave' },
  { stageNumber: 2, zoneName: 'Copa Plata', groupName: 'Llave' },
];

describe('zoneFilterOverrides', () => {
  it('selects the stage of a zone that belongs to exactly one stage', () => {
    expect(zoneFilterOverrides(rows, 'Copa Oro')).toEqual({ stageNumber: 2 });
    expect(zoneFilterOverrides(rows, 'Grupos')).toEqual({ stageNumber: 1 });
  });

  it('leaves the stage alone for a zone name shared by several stages', () => {
    expect(zoneFilterOverrides(rows, 'Copa Plata')).toEqual({});
  });

  it('leaves the stage alone for a zone no row carries', () => {
    expect(zoneFilterOverrides(rows, 'Inexistente')).toEqual({});
  });
});

describe('groupFilterOverrides', () => {
  const groupRows = rows.filter((row) => row.groupName !== undefined);

  it('selects the stage and zone of a group whose name is unique', () => {
    expect(groupFilterOverrides(groupRows, 'Grupo A', undefined)).toEqual({
      stageNumber: 1,
      zone: 'Grupos',
    });
  });

  it('keeps the active zone when one is chosen', () => {
    const activeZoneRows = groupRows.filter((row) => row.zoneName === 'Copa Plata');
    expect(groupFilterOverrides(activeZoneRows, 'Llave', 'Copa Plata')).toEqual({
      stageNumber: 2,
      zone: 'Copa Plata',
    });
  });

  it('changes neither stage nor zone for a group name held by two zones', () => {
    expect(groupFilterOverrides(groupRows, 'Llave', undefined)).toEqual({});
  });

  it('places a group only from the rows of the active zone', () => {
    const activeZoneRows = groupRows.filter((row) => row.zoneName === 'Copa Oro');
    expect(groupFilterOverrides(activeZoneRows, 'Llave', 'Copa Oro')).toEqual({
      stageNumber: 2,
      zone: 'Copa Oro',
    });
  });
});
