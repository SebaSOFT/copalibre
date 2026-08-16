import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LocalizedLabel } from '@copalibre/domain';

/** Wire DTOs are camelCase, per the naming-conventions casing rule. */

export class TableCellResponse {
  @ApiPropertyOptional({ description: 'Absent when the underlying figure has no value yet' })
  raw?: number | string | boolean;

  @ApiProperty({ description: 'Column-format-rendered text, e.g. "2.50", "4/5", "35%"' })
  formatted!: string;

  @ApiPropertyOptional({ description: 'Present only for a `composite` column source' })
  numerator?: number;

  @ApiPropertyOptional({ description: 'Present only for a `composite` column source' })
  denominator?: number;
}

export class TableRowResponse {
  @ApiProperty({ format: 'uuid' })
  actorId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Present at team/entrant granularity' })
  entrantId?: string;

  @ApiProperty({ description: '1-based; rows sharing a rank were not separated by `defaultSort`' })
  rank!: number;

  @ApiProperty({ description: 'True when another row holds the same rank' })
  sharedRank!: boolean;

  @ApiProperty({
    description: 'One cell per declared column, keyed by column code',
    type: TableCellResponse,
  })
  cells!: Record<string, TableCellResponse>;
}

export class TableColumnResponse {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  header!: string | LocalizedLabel;

  @ApiPropertyOptional()
  shortHeader?: string | LocalizedLabel;

  @ApiProperty({ enum: ['text', 'number', 'decimal-1', 'decimal-2', 'percentage', 'fraction'] })
  format!: string;
}

export class TableLayoutSummaryResponse {
  @ApiProperty()
  code!: string;

  @ApiProperty({
    enum: ['group-phase', 'match-roster', 'player-ranking', 'team-ranking', 'schedule-timeframe'],
  })
  target!: string;

  @ApiProperty()
  label!: string | LocalizedLabel;

  @ApiProperty({ enum: ['person', 'player', 'team', 'club', 'official', 'venue'] })
  entityGranularity!: string;
}

export class TableSortRuleResponse {
  @ApiProperty()
  columnCode!: string;

  @ApiProperty({ enum: ['asc', 'desc'] })
  direction!: string;
}

export class TableLayoutListResponse {
  @ApiProperty({ type: TableLayoutSummaryResponse, isArray: true })
  layouts!: TableLayoutSummaryResponse[];
}

export class TableProjectionResponse {
  @ApiProperty()
  layoutCode!: string;

  @ApiProperty({
    enum: ['group-phase', 'match-roster', 'player-ranking', 'team-ranking', 'schedule-timeframe'],
  })
  target!: string;

  @ApiProperty()
  label!: string | LocalizedLabel;

  @ApiProperty({ type: TableColumnResponse, isArray: true })
  columns!: TableColumnResponse[];

  @ApiProperty({
    type: TableSortRuleResponse,
    isArray: true,
    description: 'The layout’s declared ranking order — a client scaling a chart against "the primary metric" reads its first entry',
  })
  defaultSort!: TableSortRuleResponse[];

  @ApiProperty({ type: TableRowResponse, isArray: true })
  rows!: TableRowResponse[];

  @ApiProperty({
    description:
      'Freshest `statistic-totals` projection version among this scope’s matches; 0 when none has been folded yet',
  })
  projectionVersion!: number;
}
