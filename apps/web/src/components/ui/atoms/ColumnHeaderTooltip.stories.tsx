import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColumnHeaderTooltip } from './ColumnHeaderTooltip.js';

const meta = {
  title: 'Public/ColumnHeaderTooltip',
  component: ColumnHeaderTooltip,
  args: { label: 'PTS' },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
  },
} satisfies Meta<typeof ColumnHeaderTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { label: 'PTS', description: 'Points', infoLabel: 'About PTS' },
};

/** No description: a plain sort trigger, with no icon and no description wiring. */
export const WithoutDescription: Story = {
  args: { label: 'Rank', description: undefined },
};

/** The sort-direction glyph a caller renders once the column becomes the active sort. */
export const Sorted: Story = {
  args: {
    label: 'PTS',
    description: 'Points',
    infoLabel: 'About PTS',
    indicator: (
      <span aria-hidden="true" className="cl-column-header__indicator">
        ▾
      </span>
    ),
  },
};

/** Matrix: every combination side by side. */
export const Matrix: Story = {
  render: function Render() {
    return (
      <table>
        <thead>
          <tr>
            <th>
              <ColumnHeaderTooltip label="MP" />
            </th>
            <th>
              <ColumnHeaderTooltip description="Goal Difference" infoLabel="About GD" label="GD" />
            </th>
            <th>
              <ColumnHeaderTooltip
                description="Points"
                infoLabel="About PTS"
                indicator={
                  <span aria-hidden="true" className="cl-column-header__indicator">
                    ▴
                  </span>
                }
                label="PTS"
              />
            </th>
          </tr>
        </thead>
      </table>
    );
  },
};
