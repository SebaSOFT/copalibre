import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { DataTable, type DataTableColumn, type DataTableProps } from './data-table.js';
import { Badge } from '../atoms/badge.js';
import { storyText } from '../story-text.js';

interface StandingRow {
  readonly id: string;
  readonly entrant: string;
  readonly played: number;
  readonly points: number;
}

const ROWS: readonly StandingRow[] = [
  { id: '1', entrant: 'Club Atlético Independiente', played: 8, points: 19 },
  { id: '2', entrant: 'Deportivo San Juan', played: 8, points: 17 },
  { id: '3', entrant: 'Unión de Rivadavia', played: 8, points: 12 },
  { id: '4', entrant: 'Atlético Chimbas', played: 8, points: 9 },
];

function useColumns(): readonly DataTableColumn<StandingRow>[] {
  const intl = useIntl();
  return [
    { key: 'entrant', header: intl.formatMessage(storyText.tournaments), render: (r) => r.entrant },
    { key: 'played', header: intl.formatMessage(storyText.save), render: (r) => r.played },
    {
      key: 'points',
      header: intl.formatMessage(storyText.settingsTitle),
      render: (r) => <Badge className="cl-badge--rank" label={String(r.points)} />,
    },
  ];
}

/**
 * Typed on the props rather than on `typeof DataTable`: the organism is generic
 * over its row, and inferring `Meta` from the component erases `Row` to
 * `unknown`, which makes every `rowKey` in this file unassignable.
 */
const meta = {
  title: 'Admin/Organisms/DataTable',
  component: DataTable,
  args: { columns: [], rows: [], rowKey: (row: StandingRow) => row.id },
  argTypes: { caption: { control: 'text' }, ariaLabel: { control: 'text' } },
} satisfies Meta<DataTableProps<StandingRow>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRows: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <DataTable
        ariaLabel={intl.formatMessage(storyText.rolesTitle)}
        caption={intl.formatMessage(storyText.rolesTitle)}
        columns={useColumns()}
        rowKey={(row) => row.id}
        rows={ROWS}
      />
    );
  },
};

/**
 * No rows. The empty state is the one every listing screen has and almost none
 * are reviewed in, because reaching it means a tournament with nothing in it.
 */
export const Empty: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <DataTable
        ariaLabel={intl.formatMessage(storyText.rolesTitle)}
        columns={useColumns()}
        emptyMessage={intl.formatMessage(storyText.empty)}
        rowKey={(row) => row.id}
        rows={[]}
      />
    );
  },
};

/** An expandable detail beneath each row, which changes the row's whole rhythm. */
export const WithRowDetail: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <DataTable
        ariaLabel={intl.formatMessage(storyText.rolesTitle)}
        columns={useColumns()}
        renderRowDetail={(row) => (
          <span>
            {intl.formatMessage(storyText.saved)} — {row.entrant}
          </span>
        )}
        rowKey={(row) => row.id}
        rows={ROWS}
      />
    );
  },
};

/**
 * Long cell content against many columns: the organism scrolls its own region
 * rather than pushing the page sideways, and the 188px viewport is where that
 * promise either holds or does not.
 */
export const WideAndLong: Story = {
  render: function Render() {
    const intl = useIntl();
    const base = useColumns();
    const extra: readonly DataTableColumn<StandingRow>[] = Array.from(
      { length: 5 },
      (_unused, index) => ({
        key: `extra-${index}`,
        header: intl.formatMessage(storyText.venuesAndOfficials),
        render: (row: StandingRow) => `${row.points + index}`,
      }),
    );
    return (
      <DataTable
        ariaLabel={intl.formatMessage(storyText.rolesTitle)}
        caption={intl.formatMessage(storyText.platformTitle)}
        columns={[...base, ...extra]}
        rowKey={(row) => row.id}
        rows={ROWS}
      />
    );
  },
};
