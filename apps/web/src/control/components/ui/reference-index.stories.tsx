import type { Meta, StoryObj } from '@storybook/react-vite';
import { REFERENCE_INDEX } from './reference-index.js';

/**
 * The reference index (OpenSpec 0223).
 *
 * Every supplied reference, the story that renders it, and the production
 * surface that consumes it. Read the rows with an empty consumer column first:
 * those are the patterns that render in the workbench and nowhere else, and
 * they are listed rather than omitted because an index that hid them would
 * report a parity this change did not reach.
 *
 * Deliberately plain. It is a list a reviewer works through, and dressing it up
 * would be this page competing with the components it is meant to point at.
 */
const meta = {
  title: 'Reference index',
  parameters: {
    docs: {
      description: {
        component:
          'Each reference, its story, and the production surface consuming it. An empty consumer column is a finding, not an omission.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Index: Story = {
  render: () => (
    <div className="cl-data-table cl-card cl-chamfer cl-chamfer--control">
      <table className="cl-data-table__table">
        <caption className="cl-data-table__caption">
          0223 — references, stories and their production consumers
        </caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Story</th>
            <th scope="col">Production consumer</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {REFERENCE_INDEX.map((entry) => (
            <tr key={entry.reference}>
              <td>{entry.reference}</td>
              <td>
                <code>{entry.storyId}</code>
              </td>
              <td>
                {entry.consumers.length === 0 ? (
                  <span className="cl-metric-strip__unavailable">No consumer</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 'var(--cl-space-4)' }}>
                    {entry.consumers.map((consumer) => (
                      <li key={consumer}>
                        <code>{consumer}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td>{entry.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};
