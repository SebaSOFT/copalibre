import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { FilterBar } from './filter-bar.js';
import { storyText } from '../story-text.js';

const meta = {
  title: 'Admin/Organisms/FilterBar',
  component: FilterBar,
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    searchId: '',
    searchLabel: '',
    searchValue: '',
    onSearchChange: () => {},
    filtersLabel: '',
    options: [],
    selectedOptionId: '',
    onOptionChange: () => {},
    resultCount: null,
  },
  render: function Render() {
    const intl = useIntl();
    const [query, setQuery] = useState('');
    const [selectedOptionId, setSelectedOptionId] = useState('live');

    return (
      <div>
        <p className="cl-metric-strip__demonstration">
          {intl.formatMessage(storyText.metricDemonstration)}
        </p>
        <FilterBar
          filtersLabel={intl.formatMessage(storyText.status)}
          onOptionChange={setSelectedOptionId}
          onSearchChange={setQuery}
          options={[
            { id: 'all', label: intl.formatMessage(storyText.filterAll), count: 8 },
            { id: 'live', label: intl.formatMessage(storyText.lifecycleLive), count: 2 },
            { id: 'draft', label: intl.formatMessage(storyText.lifecycleDraft), count: 3 },
          ]}
          resultCount={
            <>
              <strong>8</strong> {intl.formatMessage(storyText.dashboardTournaments)}
            </>
          }
          searchId="tournament-search"
          searchLabel={intl.formatMessage(storyText.dashboardTournaments)}
          searchValue={query}
          selectedOptionId={selectedOptionId}
        />
      </div>
    );
  },
};
