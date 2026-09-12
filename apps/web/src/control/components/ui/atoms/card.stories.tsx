import type { Meta, StoryObj } from '@storybook/react-vite';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardSection,
} from './card.js';
import { Button } from './button.js';
import { FilePicker } from './file-picker.js';
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

/** Real selection state alongside chrome and content on each calibrated band. */
function SurfaceSample({ base }: { readonly base: boolean }) {
  const intl = useIntl();
  const [file, setFile] = useState<File | null>(
    () => new File(['name\nExample'], 'entrants.csv', { type: 'text/csv' }),
  );
  return (
    <CardSection
      aria-label={base ? 'Base band' : 'Panel band'}
      className={base ? 'cl-band--base' : undefined}
      style={{ padding: 'clamp(var(--cl-space-2), 3vw, var(--cl-space-6))' }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{intl.formatMessage(storyText.settingsTitle)}</CardTitle>
        </CardHeader>
        <CardContent style={{ display: 'grid', gap: 'var(--cl-space-4)' }}>
          <p>{intl.formatMessage(storyText.saved)}</p>
          <FilePicker
            id={base ? 'base-selection' : 'panel-selection'}
            label={intl.formatMessage(storyText.reportTitle)}
            clearLabel={intl.formatMessage(storyText.dismiss)}
            accept=".csv"
            maxSizeBytes={1024 * 1024}
            value={file}
            onChange={(files) => setFile(files?.[0] ?? null)}
            onClear={() => setFile(null)}
          />
        </CardContent>
        <CardFooter>
          <Button variant="secondary">{intl.formatMessage(storyText.cancel)}</Button>
        </CardFooter>
      </Card>
    </CardSection>
  );
}

export const AlternationAndChrome: Story = {
  render: () => (
    <div className="cl-control-screen" style={{ display: 'grid', gap: 'var(--cl-space-6)' }}>
      <SurfaceSample base={false} />
      <SurfaceSample base={true} />
    </div>
  ),
};
