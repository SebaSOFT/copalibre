// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

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
      // English is the default (unprefixed) locale (0051): `starlight-llms-txt`
      // sources llms.txt/llms-full.txt from whichever locale is `defaultLocale`,
      // and LLM-facing docs must stay English regardless of how many other
      // interface languages this site later supports.
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        es: { label: 'Español', lang: 'es' },
        fr: { label: 'Français', lang: 'fr' },
        pt: { label: 'Português', lang: 'pt' },
        it: { label: 'Italiano', lang: 'it' },
        de: { label: 'Deutsch', lang: 'de' },
        ru: { label: 'Русский', lang: 'ru' },
      },
      plugins: [
        starlightLlmsTxt({
          projectName: 'CopaLibre',
          description:
            'Self-hosted, open-source tournament-management platform (AGPL-3.0). Operator ' +
            'documentation for installation, the control panel, the copalibre CLI, and its MCP ' +
            'server for AI agents.',
        }),
      ],
      sidebar: [
        {
          label: 'CopaLibre',
          items: [
            'help',
            'help/getting-started',
            'help/operations',
            {
              label: 'API reference',
              translations: {
                es: 'Referencia API',
                fr: 'Référence API',
                pt: 'Referência da API',
                it: 'Riferimento API',
                de: 'API-Referenz',
                ru: 'Справочник API',
              },
              link: '/help/api-reference/',
              attrs: { 'data-astro-reload': true },
            },
          ],
        },
        {
          label: 'Control panel',
          translations: {
            es: 'Panel de control',
            fr: 'Panneau de contrôle',
            pt: 'Painel de controle',
            it: 'Pannello di controllo',
            de: 'Kontrollpanel',
            ru: 'Панель управления',
          },
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
          label: 'copalibre CLI',
          translations: {
            es: 'CLI de copalibre',
            fr: 'CLI copalibre',
            pt: 'CLI do copalibre',
            it: 'CLI di copalibre',
            de: 'copalibre-CLI',
            ru: 'CLI copalibre',
          },
          items: [
            'help/cli',
            'help/cli/installation',
            'help/cli/updating',
            'help/cli/commands',
            'help/cli/mcp',
          ],
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
