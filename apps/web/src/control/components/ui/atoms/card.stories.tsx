import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.js';
import { Button } from './button.js';
import { storyText } from '../story-text.js';

/**
 * `card.tsx` exports a compound — `Card` plus five slot components — so its
 * stories are composed rather than driven from `argTypes`: the thing worth
 * reviewing is how the slots sit together, not any one slot's props.
 */
const meta = {
  title: 'Admin/Atoms/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Card aria-label={intl.formatMessage(storyText.settingsTitle)}>
        <CardHeader>
          <CardTitle>{intl.formatMessage(storyText.settingsTitle)}</CardTitle>
          <CardDescription>{intl.formatMessage(storyText.saved)}</CardDescription>
        </CardHeader>
        <CardContent>{intl.formatMessage(storyText.empty)}</CardContent>
        <CardFooter>
          <Button variant="primary">{intl.formatMessage(storyText.save)}</Button>
        </CardFooter>
      </Card>
    );
  },
};

/** Header and content only — the shape most screens actually use. */
export const HeaderAndContent: Story = {
  render: function Render() {
    const intl = useIntl();
    return (
      <Card>
        <CardHeader>
          <CardTitle>{intl.formatMessage(storyText.rolesTitle)}</CardTitle>
        </CardHeader>
        <CardContent>{intl.formatMessage(storyText.empty)}</CardContent>
      </Card>
    );
  },
};

/**
 * `Card` computes `role="region"` when it is given an accessible name, and
 * leaves the role off when it is not. Both are here because the difference is
 * invisible on screen and visible only in the accessibility tree.
 */
export const Bare: Story = {
  render: function Render() {
    const intl = useIntl();
    return <Card>{intl.formatMessage(storyText.loading)}</Card>;
  },
};

/**
 * Renders the same card on a dark and light band, with lifted chrome and
 * a selected container beside them (task 2.5).
 */
export const AlternationAndChrome: Story = {
  render: function Render() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div
          className="cl-band cl-chamfer"
          style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <h4>Panel Band (.cl-band)</h4>
          <Card>
            <CardHeader>
              <CardTitle>Header lifts to chrome</CardTitle>
            </CardHeader>
            <CardContent>Body drops to base</CardContent>
            <CardFooter>Footer is chrome</CardFooter>
          </Card>
        </div>
        <div
          className="cl-band cl-band--base cl-chamfer"
          style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <h4>Base Band (.cl-band--base)</h4>
          <Card>
            <CardHeader>
              <CardTitle>Header lifts to chrome</CardTitle>
            </CardHeader>
            <CardContent>Body lifts to panel</CardContent>
            <CardFooter>Footer is chrome</CardFooter>
          </Card>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="cl-chrome cl-chamfer" style={{ padding: '1rem' }}>
            Lifted Chrome
          </div>
          <div className="cl-card--live cl-chamfer" style={{ padding: '1rem' }}>
            Selected Container
          </div>
        </div>
      </div>
    );
  },
};
