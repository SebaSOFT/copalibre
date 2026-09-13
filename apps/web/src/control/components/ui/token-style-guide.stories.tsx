/// <reference types="vite/client" />
import type { Meta, StoryObj } from '@storybook/react-vite';
import styleGuideHtml from '@copalibre/design-tokens/generated/style-guide.html?raw';

/**
 * The generated token style guide, presented rather than reimplemented
 * (OpenSpec 0213, design.md Decision 7).
 *
 * `packages/design-tokens` writes `generated/style-guide.html` from the token
 * source. Restating those values as stories would reintroduce exactly the drift
 * the generator exists to prevent, so the artifact is embedded verbatim: rebuild
 * the tokens and this page changes with no story edited.
 *
 * It renders in an iframe because the artifact is a whole document with its own
 * styles; inlining it would leak those styles into every other story on the
 * page.
 */
function TokenStyleGuide(): React.JSX.Element {
  return (
    <iframe
      srcDoc={styleGuideHtml}
      style={{ border: 0, height: '100vh', width: '100%' }}
      title="CopaLibre token style guide"
    />
  );
}

const meta = {
  title: 'Tokens/Style Guide',
  component: TokenStyleGuide,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TokenStyleGuide>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Generated: Story = {};
