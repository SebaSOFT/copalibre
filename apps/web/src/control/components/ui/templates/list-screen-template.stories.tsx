import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { ListScreenTemplate } from './list-screen-template.js';
import { DataTable } from '../organisms/data-table.js';
import { TableToolbar } from '../molecules/table-toolbar.js';
import { Pagination } from '../molecules/pagination.js';
import { Button } from '../atoms/button.js';
import { Input } from '../atoms/input.js';
import { storyText } from '../story-text.js';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}

const ROWS: readonly Row[] = [
  { id: '1', name: 'Estadio del Bicentenario', count: 12 },
  { id: '2', name: 'Polideportivo Municipal', count: 8 },
  { id: '3', name: 'Club Social y Deportivo', count: 3 },
];

const meta = {
  title: 'Admin/Templates/ListScreenTemplate',
  component: ListScreenTemplate,
  args: { title: '', listing: null },
} satisfies Meta<typeof ListScreenTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every slot filled — the shape a real listing screen composes. */
export const Populated: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <ListScreenTemplate
        breadcrumb={intl.formatMessage(storyText.platformTitle)}
        listing={
          <DataTable
            ariaLabel={intl.formatMessage(storyText.venuesAndOfficials)}
            columns={[
              {
                key: 'name',
                header: intl.formatMessage(storyText.venuesAndOfficials),
                render: (row) => row.name,
              },
              {
                key: 'count',
                header: intl.formatMessage(storyText.tournaments),
                render: (row) => row.count,
              },
            ]}
            rowKey={(row) => row.id}
            rows={ROWS}
          />
        }
        pagination={<Pagination onPageChange={() => undefined} page={1} pageCount={4} />}
        title={intl.formatMessage(storyText.venuesAndOfficials)}
        toolbar={
          <TableToolbar
            actions={<Button variant="primary">{intl.formatMessage(storyText.save)}</Button>}
          >
            <Input aria-label="filter" placeholder={intl.formatMessage(storyText.tournaments)} />
          </TableToolbar>
        }
      />
    );
  },
};

/** Title and listing only: every other slot is optional and often absent. */
export const Minimal: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <ListScreenTemplate
        listing={
          <DataTable<Row>
            ariaLabel={intl.formatMessage(storyText.rolesTitle)}
            columns={[
              {
                key: 'name',
                header: intl.formatMessage(storyText.rolesTitle),
                render: (row) => row.name,
              },
            ]}
            emptyMessage={intl.formatMessage(storyText.empty)}
            rowKey={(row) => row.id}
            rows={[]}
          />
        }
        title={intl.formatMessage(storyText.rolesTitle)}
      />
    );
  },
};
