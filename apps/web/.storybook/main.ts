import type { StorybookConfig } from '@storybook/react-vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

/**
 * The component workbench (OpenSpec 0213).
 *
 * A local review surface, deliberately: there is no `build-storybook` script
 * and nothing hosted, so what the workbench lists is always what the
 * checked-out branch contains (design.md Decision 1 / Non-Goals).
 *
 * `react-vite` rather than a second bundler: Astro 7 already builds this
 * workspace with Vite 8, which is inside Storybook 10's declared peer range.
 */
const config: StorybookConfig = {
  framework: { name: '@storybook/react-vite', options: {} },
  stories: ['../src/**/*.stories.tsx'],
  /**
   * `@storybook/react-vite` does not bundle a React plugin: it expects the
   * project's own Vite config to provide one. Astro owns this workspace's Vite
   * configuration and there is no `vite.config.ts`, so without this nothing
   * transforms JSX — every `.tsx` under `src/` fails import analysis and the
   * dev server answers 404, leaving the preview blank with no visible error.
   */
  viteFinal: (config) => ({
    ...config,
    plugins: [...(config.plugins ?? []), react()],
    resolve: {
      ...config.resolve,
      alias: [
        ...(Array.isArray(config.resolve?.alias) ? config.resolve.alias : []),
        /*
         * `@copalibre/domain`'s barrel re-exports the CSV importer and
         * exporter, and `apps/web/src/lib/language-preference.ts` imports three
         * i18n constants from that same barrel. `csv-parse` and `csv-stringify`
         * both read `Buffer` at module scope, so in a browser they throw before
         * anything renders — which took out every story at once. A production
         * build tree-shakes them away; a dev server does not. See
         * `csv-stub.mjs` for the full note.
         */
        {
          find: /^csv-(parse|stringify)(\/.*)?$/,
          replacement: fileURLToPath(new URL('./csv-stub.mjs', import.meta.url)),
        },
      ],
    },
  }),
  core: {
    // A local review surface should not phone home about what is being
    // reviewed; nothing here needs Storybook's usage analytics.
    disableTelemetry: true,
  },
  typescript: {
    // The library's props are `readonly` fields on exported interfaces;
    // react-docgen-typescript reads those, so a story's controls come from the
    // component's own type rather than from a hand-written argTypes block.
    reactDocgen: 'react-docgen-typescript',
    // `.storybook/tsconfig.json` overrides Astro's `jsx: "preserve"`, which the
    // React builder cannot use — see the comment there.
    reactDocgenTypescriptOptions: { tsconfigPath: './.storybook/tsconfig.json' },
  },
};

export default config;
