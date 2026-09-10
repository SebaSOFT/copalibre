import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { EditorialCard } from './EditorialCard.js';
import { messages } from '../../../i18n/messages.en.js';

/**
 * The editorial card, shown with the data its production consumer actually has.
 *
 * Its consumer is the platform administration route's module-update list, which
 * already fetched these values from `listOutdatedModules`. Nothing here is a
 * release note, a benchmark, or a certification: this change added no release
 * subsystem, and the composition reads whatever the surface it sits in knows.
 */
const meta = {
  title: 'Admin/Molecules/EditorialCard',
  component: EditorialCard,
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'inverse'] },
  },
} satisfies Meta<typeof EditorialCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: { title: '' },
  render: function Render(args) {
    const intl = useIntl();
    return (
      <EditorialCard
        {...args}
        callout={{
          title: intl.formatMessage(messages.platformUpdateCalloutTitle),
          description: intl.formatMessage(messages.platformUpdateCalloutDescription),
        }}
        dateline={intl.formatMessage(messages.platformUpdateKind, { upgrade: 'minor' })}
        eyebrow={intl.formatMessage(messages.platformUpdateEyebrow)}
        title={intl.formatMessage(messages.platformUpdateHeadline, {
          alias: 'football-11v11',
          currentVersion: '1.2.0',
          latestVersion: '1.3.0',
        })}
      />
    );
  },
};

/**
 * Both surface treatments, and the version with nothing to act on.
 *
 * `inverse` lifts the card off its band, for a card that is the section rather
 * than one entry in a list of them.
 */
export const Matrix: Story = {
  args: { title: '' },
  render: function Render() {
    const intl = useIntl();
    const title = intl.formatMessage(messages.platformUpdateHeadline, {
      alias: 'basketball-3x3',
      currentVersion: '2.0.1',
      latestVersion: '2.1.0',
    });
    const callout = {
      title: intl.formatMessage(messages.platformUpdateCalloutTitle),
      description: intl.formatMessage(messages.platformUpdateCalloutDescription),
    };
    return (
      <div className="cl-band" style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
        <EditorialCard callout={callout} title={title} />
        <EditorialCard callout={callout} title={title} variant="inverse" />
        <EditorialCard
          dateline={intl.formatMessage(messages.platformUpdateKind, { upgrade: 'patch' })}
          eyebrow={intl.formatMessage(messages.platformUpdateEyebrow)}
          title={title}
        />
      </div>
    );
  },
};
