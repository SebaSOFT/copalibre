import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { StandingsFigure, StandingsPanel, StandingsRank } from './standings-panel.js';
import type { DataTableColumn } from './data-table.js';
import { ColumnHeaderTooltip } from '../../../../components/ui/atoms/ColumnHeaderTooltip.js';
import { messages } from '../../../i18n/messages.en.js';
import {
  referenceStandingsTable,
  type ReferenceStandingsRow,
} from '../../../../lib/reference-fixtures.js';

/**
 * The standings panel over the canonical tied-leaders fixture.
 *
 * Every number below is computed from `referenceGroupMatches()`, so the table
 * demonstrates a competition that could actually have happened rather than one
 * chosen to look convincing. The two leaders finish level on points and the
 * head-to-head column — marked in the rows it decided, and named as triggered
 * in the footer's chain — is what separates them.
 *
 * Column headers are the discipline's own abbreviations. They are data, not
 * interface chrome: on a real surface the API sends them localized with the
 * projection, so the workbench's language selector correctly leaves them alone
 * while it moves the panel's title, its tag and its footer.
 */
const meta = {
  title: 'Admin/Organisms/StandingsPanel',
  component: StandingsPanel,
} satisfies Meta<typeof StandingsPanel<ReferenceStandingsRow>>;

export default meta;
type Story = StoryObj<typeof meta>;

const SHORT_HEADERS: Readonly<Record<string, string>> = {
  played: 'PJ',
  wins: 'G',
  draws: 'E',
  losses: 'P',
  'goals-for': 'GF',
  'goals-against': 'GC',
  'score-difference': 'Dif',
  'head-to-head': 'H2H',
  points: 'Pts',
};

function useReferenceColumns(
  decidingCode: string,
): readonly DataTableColumn<ReferenceStandingsRow>[] {
  const intl = useIntl();
  const decidingLabel = intl.formatMessage(messages.standingsPanelDecidedBy);
  return [
    {
      key: 'rank',
      header: intl.formatMessage(messages.standingsRankColumn),
      render: (row) => <StandingsRank>{row.rank}</StandingsRank>,
    },
    {
      key: 'entrant',
      header: intl.formatMessage(messages.standingsParticipant),
      render: (row) => row.name,
    },
    ...referenceStandingsTable().columns.map((code) => ({
      key: code,
      header: SHORT_HEADERS[code] ?? code,
      render: (row: ReferenceStandingsRow) => (
        <StandingsFigure
          deciding={code === decidingCode && row.tieBroken}
          decidingLabel={decidingLabel}
        >
          {row.statistics[code]}
        </StandingsFigure>
      ),
    })),
  ];
}

/** The reference scenario: four entrants, two level, the decider visible. */
export const Playground: Story = {
  args: {
    title: '',
    columns: [],
    rows: [],
    rowKey: () => '',
  },
  render: function Render() {
    const intl = useIntl();
    const table = referenceStandingsTable();
    const columns = useReferenceColumns(table.decidingCode);
    return (
      <StandingsPanel
        columns={columns}
        eyebrow={intl.formatMessage(messages.standingsSectionLabel)}
        rowKey={(row) => row.entrantId}
        rows={table.rows}
        tiebreakerTitle={intl.formatMessage(messages.standingsTiebreakerSequenceTitle)}
        tiebreakers={table.tiebreakerCodes.map((code, index) => ({
          step: index + 1,
          label: SHORT_HEADERS[code] ?? code,
          triggered: code === table.decidingCode,
        }))}
        title={intl.formatMessage(messages.standingsTitle)}
      />
    );
  },
};

/**
 * The panel's states side by side: decided, nothing to break, and empty.
 *
 * A format that declares no comparator chain renders no footer at all — an
 * empty tiebreaker strip would imply the question was asked and answered with
 * nothing, which is a different claim from "this format never asks it".
 */
export const Matrix: Story = {
  args: { title: '', columns: [], rows: [], rowKey: () => '' },
  render: function Render() {
    const intl = useIntl();
    const table = referenceStandingsTable();
    const columns = useReferenceColumns(table.decidingCode);
    const untied = table.rows.map((row) => ({ ...row, tieBroken: false }));
    return (
      <div style={{ display: 'grid', gap: 'var(--cl-space-6)' }}>
        <StandingsPanel
          columns={columns}
          eyebrow={intl.formatMessage(messages.standingsSectionLabel)}
          rowKey={(row) => row.entrantId}
          rows={table.rows}
          tiebreakerTitle={intl.formatMessage(messages.standingsTiebreakerSequenceTitle)}
          tiebreakers={table.tiebreakerCodes.map((code, index) => ({
            step: index + 1,
            label: SHORT_HEADERS[code] ?? code,
            triggered: code === table.decidingCode,
          }))}
          title={intl.formatMessage(messages.standingsTitle)}
        />
        <StandingsPanel
          columns={columns}
          rowKey={(row) => row.entrantId}
          rows={untied}
          title={intl.formatMessage(messages.standingsTitle)}
        />
        <StandingsPanel
          columns={columns}
          emptyMessage={intl.formatMessage(messages.standingsNoResultsYet)}
          rowKey={(row) => row.entrantId}
          rows={[]}
          title={intl.formatMessage(messages.standingsTitle)}
        />
      </div>
    );
  },
};

/**
 * The full canonical chrome (openspec 0248): descriptor subtitle, verified
 * badge, compact sticky-header table, sortable+described column headers,
 * signed goal-difference colouring, an emphasised primary metric, and an
 * audit proof code beside the tiebreaker pipeline title.
 *
 * `score-difference` is coloured from its own sign — the sign is still
 * printed, per the identity doc's accessibility gate, colour only
 * reinforces it. `points` is emphasised because it is this table's own
 * `defaultSort[0]`, not because any code here recognises a "points" column
 * by name.
 */
interface LocalSort {
  readonly columnCode: string;
  readonly direction: 'asc' | 'desc';
}

/** The same three-state cycle `table-projections.ts#nextSort` implements, against this story's own local fixture shape rather than the backend row contract. */
function nextLocalSort(current: LocalSort | undefined, columnCode: string): LocalSort | undefined {
  if (current?.columnCode !== columnCode) return { columnCode, direction: 'desc' };
  if (current.direction === 'desc') return { columnCode, direction: 'asc' };
  return undefined;
}

export const CanonicalChrome: Story = {
  args: { title: '', columns: [], rows: [], rowKey: () => '' },
  render: function Render() {
    const intl = useIntl();
    const table = referenceStandingsTable();
    const primaryMetricCode = 'points';
    const [sort, setSort] = useState<LocalSort | undefined>(undefined);
    const sortedRows =
      sort === undefined
        ? table.rows
        : [...table.rows].sort(
            (a, b) =>
              ((a.statistics[sort.columnCode] ?? 0) - (b.statistics[sort.columnCode] ?? 0)) *
              (sort.direction === 'desc' ? -1 : 1),
          );
    const columns: readonly DataTableColumn<ReferenceStandingsRow>[] = [
      {
        key: 'rank',
        header: intl.formatMessage(messages.standingsRankColumn),
        render: (row) => <StandingsRank>{row.rank}</StandingsRank>,
      },
      {
        key: 'entrant',
        header: intl.formatMessage(messages.standingsParticipant),
        render: (row) => row.name,
      },
      ...table.columns.map((code) => ({
        key: code,
        ariaSort: (sort?.columnCode !== code
          ? 'none'
          : sort.direction === 'asc'
            ? 'ascending'
            : 'descending') as 'none' | 'ascending' | 'descending',
        header: (
          <ColumnHeaderTooltip
            description={code}
            indicator={
              sort?.columnCode === code ? (
                <span aria-hidden="true" className="cl-column-header__indicator">
                  {sort.direction === 'desc' ? '▾' : '▴'}
                </span>
              ) : undefined
            }
            label={SHORT_HEADERS[code] ?? code}
            onClick={() => setSort(nextLocalSort(sort, code))}
          />
        ),
        render: (row: ReferenceStandingsRow) => {
          const value = row.statistics[code] ?? 0;
          const tone =
            code === 'score-difference'
              ? value > 0
                ? 'positive'
                : value < 0
                  ? 'negative'
                  : undefined
              : code === primaryMetricCode
                ? 'emphasis'
                : undefined;
          return (
            <StandingsFigure
              deciding={code === table.decidingCode && row.tieBroken}
              decidingLabel={intl.formatMessage(messages.standingsPanelDecidedBy)}
              tone={tone}
            >
              {value > 0 && code === 'score-difference' ? `+${value}` : value}
            </StandingsFigure>
          );
        },
      })),
    ];
    return (
      <StandingsPanel
        auditProofCode="Audit Proof #TP-982"
        columns={columns}
        compact
        descriptorSubtitle="Reglamento: Football-Standard (DisciplineDescriptor v1.2.0)"
        eyebrow={intl.formatMessage(messages.standingsSectionLabel)}
        rowKey={(row) => row.entrantId}
        rows={sortedRows}
        stickyHeader
        tableAriaLabel={intl.formatMessage(messages.standingsSectionLabel)}
        tiebreakerTitle={intl.formatMessage(messages.standingsTiebreakerSequenceTitle)}
        tiebreakers={table.tiebreakerCodes.map((code, index) => ({
          step: index + 1,
          label: SHORT_HEADERS[code] ?? code,
          triggered: code === table.decidingCode,
        }))}
        title={intl.formatMessage(messages.standingsTitle)}
        verifiedLabel="Standings verified"
      />
    );
  },
};

/**
 * A discipline declaring different statistics.
 *
 * Nothing in the panel names a football column: drop the goal columns and add a
 * frag count, and the table follows the descriptor rather than borrowing a
 * column the discipline never declared.
 */
export const OtherDisciplineColumns: Story = {
  args: { title: '', columns: [], rows: [], rowKey: () => '' },
  render: function Render() {
    const intl = useIntl();
    const table = referenceStandingsTable();
    const rows = table.rows.map((row) => ({
      ...row,
      statistics: {
        played: row.statistics.played ?? 0,
        frags: (row.statistics['goals-for'] ?? 0) * 7,
        points: row.statistics.points ?? 0,
      },
    }));
    const columns: readonly DataTableColumn<ReferenceStandingsRow>[] = [
      {
        key: 'rank',
        header: intl.formatMessage(messages.standingsRankColumn),
        render: (row) => <StandingsRank>{row.rank}</StandingsRank>,
      },
      {
        key: 'entrant',
        header: intl.formatMessage(messages.standingsParticipant),
        render: (row) => row.name,
      },
      ...['played', 'frags', 'points'].map((code) => ({
        key: code,
        header: code,
        render: (row: ReferenceStandingsRow) => (
          <StandingsFigure>{row.statistics[code]}</StandingsFigure>
        ),
      })),
    ];
    return (
      <StandingsPanel
        columns={columns}
        rowKey={(row) => row.entrantId}
        rows={rows}
        title={intl.formatMessage(messages.standingsTitle)}
      />
    );
  },
};
