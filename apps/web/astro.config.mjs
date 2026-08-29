// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

import node from '@astrojs/node';

// React is wired now but only used from /control/** routes starting at
// Control-web shell and organization dashboard (see openspec/changes/README.md).
export default defineConfig({
  site: process.env.COPALIBRE_SITE ?? 'http://localhost:4321',
  adapter: node({ mode: 'standalone' }),
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
      // This site has a real top-level 404 (SPA-aware for /control/**,
      // per public-web's no-JS baseline for a genuinely missing page).
      // Starlight injects its own 404 route by default, which otherwise
      // collides with it (a warning today, a hard error in later Astro
      // versions).
      disable404Route: true,
      logo: { src: './src/assets/copalibre-logo.svg', alt: 'CopaLibre' },
      // English is the default (unprefixed) locale: `starlight-llms-txt`
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
        zh: { label: '中文', lang: 'zh' },
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
            'help/self-hosting',
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
                zh: 'API 参考',
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
            zh: '控制面板',
          },
          items: [
            'help/control',
            'help/control/tournament-authoring',
            'help/control/series',
            'help/control/schedule',
            'help/control/resources',
            'help/control/registration-review',
            'help/control/person-profile',
            'help/control/clubs',
            'help/control/zone-groups',
            'help/control/promotion-plan',
            'help/control/seeding',
            'help/control/standings',
            'help/control/match-console',
            'help/control/load-match-data',
            'help/control/corrections',
            'help/control/report-review',
            'help/control/import-export',
            'help/control/broadcast-surfaces',
            'help/control/roles-permissions',
            'help/control/platform-administration',
            'help/control/preferences',
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
            zh: 'copalibre CLI',
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
        PageTitle: './src/components/starlight/HelpPageTitle.astro',
      },
    }),
  ],
});
