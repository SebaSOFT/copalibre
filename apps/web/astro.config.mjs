// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';

// React is wired now but only used from /control/** routes starting at
// 0022-control-web-shell-and-org-dashboard (see openspec/changes/README.md).
export default defineConfig({
  site: process.env.COPALIBRE_SITE ?? 'http://localhost:4321',
  // Starlight otherwise enables Astro prefetch globally, adding JavaScript to
  // public broadcast pages that must remain useful without it. ClientRouter
  // continues to handle documentation navigation after a click.
  prefetch: false,
  integrations: [
    react(),
    starlight({
      title: 'CopaLibre Help',
      description: 'Operator documentation for self-hosted CopaLibre tournaments.',
      favicon: '/copalibre-logo.svg',
      logo: { src: './src/assets/copalibre-logo.svg', alt: 'CopaLibre' },
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
        en: { label: 'English', lang: 'en' },
      },
      sidebar: [
        {
          label: 'CopaLibre',
          items: [
            'help',
            'help/getting-started',
            'help/operations',
            {
              label: 'Referencia API',
              link: '/help/api-reference/',
              attrs: { 'data-astro-reload': true },
            },
          ],
        },
        {
          label: 'Panel de control',
          items: [
            'help/control',
            'help/control/tournament-authoring',
            'help/control/registration-review',
            'help/control/report-review',
            'help/control/standings',
            'help/control/seeding',
            'help/control/roles-permissions',
            'help/control/match-console',
          ],
        },
        {
          label: 'CLI de copalibre',
          items: ['help/cli', 'help/cli/installation', 'help/cli/updating', 'help/cli/commands'],
        },
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ['./src/styles/help.css'],
      components: {
        Head: './src/components/starlight/HelpHead.astro',
        Search: './src/components/starlight/HelpSearch.astro',
      },
    }),
  ],
});
