import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Alert, type AlertTone } from './alert.js';
import { StoryMatrix } from '../story-matrix.js';
import { storyText } from '../story-text.js';

const TONES: readonly AlertTone[] = ['info', 'success', 'destructive', 'live'];

const meta = {
  title: 'Admin/Atoms/Alert',
  component: Alert,
  args: { tone: 'info', children: null },
  argTypes: {
    tone: { control: 'inline-radio', options: TONES },
    live: { control: 'inline-radio', options: [undefined, 'polite', 'assertive', 'off'] },
    heading: { control: 'text' },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: function Render(args) {
    const intl = useIntl();
    return <Alert {...args}>{intl.formatMessage(storyText.saved)}</Alert>;
  },
};

/**
 * Every tone side by side — the view that shows why this component exists.
 * Before it, 65 of 68 inline alerts declared no tone at all, so an error, a
 * success confirmation and a loading message all drew the same rail.
 */
export const Tones: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <StoryMatrix
        minColumn="240px"
        cells={TONES.map((tone) => ({
          label: tone,
          children: <Alert tone={tone}>{intl.formatMessage(storyText.saved)}</Alert>,
        }))}
      />
    );
  },
};

/** With a title the alert stacks, which is the shape a two-line message needs. */
export const Titled: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Alert heading={intl.formatMessage(storyText.emptyTitle)} tone="success">
        {intl.formatMessage(storyText.saved)}
      </Alert>
    );
  },
};

/** A list of validation problems — the case that cannot be a paragraph. */
export const WithAList: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Alert heading={intl.formatMessage(storyText.reportTitle)} tone="destructive">
        <ul>
          <li>{intl.formatMessage(storyText.empty)}</li>
          <li>{intl.formatMessage(storyText.loading)}</li>
        </ul>
      </Alert>
    );
  },
};

/** Dismissible: the control appears only when a handler is supplied. */
export const Dismissible: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Alert
        dismissLabel={intl.formatMessage(storyText.dismiss)}
        onDismiss={() => undefined}
        tone="info"
      >
        {intl.formatMessage(storyText.saved)}
      </Alert>
    );
  },
};
