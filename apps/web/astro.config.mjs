// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

import node from '@astrojs/node';
import cspStaticInlineHashes from './integrations/csp-static-inline-hashes.mjs';

const site = process.env.COPALIBRE_SITE ?? 'http://localhost:4321';
const siteHostname = new URL(site).hostname;

// React is wired now but only used from /control/** routes starting at
// Control-web shell and organization dashboard (see openspec/changes/README.md).
export default defineConfig({
  site,
  // A hosts-file alias pointing at 127.0.0.1 needs an IPv4 listener. Keep
  // Astro's localhost binding when no custom site is configured.
  server: { host: siteHostname === 'localhost' ? 'localhost' : '127.0.0.1' },
  adapter: node({ mode: 'standalone' }),
  // Starlight otherwise enables Astro prefetch globally, adding JavaScript to
  // public broadcast pages that must remain useful without it. ClientRouter
  // continues to handle documentation navigation after a click.
  prefetch: false,
  // Build-time half of the Content Security Policy: Astro hashes every inline
  // script and style it renders and writes them into a <meta> policy on each
  // page, prerendered or on demand. The web role's Caddy sends the other half
  // as a header (connections, frames, framing ancestors, the identity
  // provider's origin), which only the running installation knows. A browser
  // enforces both, so an inline script runs only when the build hashed it.
  // No 'unsafe-inline' for scripts: Astro would then drop the hashes.
  security: {
    csp: {
      algorithm: 'SHA-256',
      scriptDirective: {
        // Background removal (onnxruntime) and help search (Pagefind) compile WASM.
        resources: ["'self'", "'wasm-unsafe-eval'"],
      },
      styleDirective: {
        // Inline styles are allowed, elements and attributes alike: the build
        // renders about 30,000 style attributes and Control renders <style>
        // elements at runtime. A style cannot run code, and with images, fonts
        // and connections limited to this origin it has no way to send data out.
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },
  integrations: [
    {
      name: 'copalibre-local-preview',
      hooks: {
        'astro:config:setup': ({ command, injectRoute }) => {
          if (command === 'dev') {
            injectRoute({
              pattern: '/__preview/[component]',
              entrypoint: './src/preview/AstroPreview.astro',
              prerender: false,
            });
            const locales = ['', '/es', '/fr', '/pt', '/it', '/de', '/ru', '/zh'];
            const helpRoutes = locales.flatMap((locale) => [
              `${locale}/help/`,
              `${locale}/help/api-reference/`,
            ]);
            for (const pattern of helpRoutes) {
              injectRoute({
                pattern,
                entrypoint: './src/dev/HelpUnavailable.astro',
                prerender: false,
              });
            }
          }
        },
      },
    },
    react(),
    cspStaticInlineHashes(),
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
          items: ['help', 'help/self-hosting', 'help/getting-started', 'help/operations'],
        },
        {
          label: 'Role manuals',
          translations: {
            es: 'Manuales de rol',
            fr: 'Manuels de rôle',
            pt: 'Manuais de função',
            it: 'Manuali dei ruoli',
            de: 'Rollenhandbücher',
            ru: 'Руководства по ролям',
            zh: '角色手册',
          },
          items: [
            'help/roles',
            'help/roles/admin',
            'help/roles/club-admin',
            'help/roles/tournament-admin',
            'help/roles/referee',
            'help/roles/broadcaster',
            'help/roles/viewer',
            'help/roles/super-admin',
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
            'help/control/overview',
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
          label: 'Tournament formats',
          translations: {
            es: 'Formatos de torneo',
            fr: 'Formats de tournoi',
            pt: 'Formatos de torneio',
            it: 'Formati di torneo',
            de: 'Turnierformate',
            ru: 'Форматы турниров',
            zh: '比赛赛制',
          },
          items: [
            'help/formats/swiss',
            'help/formats/bracket-groups',
            'help/formats/gauntlet',
            'help/formats/custom-bracket',
            'help/formats/ffa-brackets',
            'help/formats/ffa-league',
          ],
        },
        {
          label: 'Standings & tiebreakers',
          translations: {
            es: 'Clasificaciones y desempates',
            fr: 'Classements et départages',
            pt: 'Classificações e desempates',
            it: 'Classifiche e spareggi',
            de: 'Tabellen und Tiebreaker',
            ru: 'Таблицы и тай-брейки',
            zh: '积分榜与平局决胜',
          },
          items: [
            'help/standings/scopes-and-head-to-head',
            'help/standings/strength-of-schedule',
            'help/standings/forfeits-and-admin',
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
  vite: {
    build: {
      // Never inline a font as a data: URI: the Content Security Policy serves
      // fonts from this origin only (font-src 'self'). Other small assets keep
      // Vite's default inlining.
      assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined),
    },
    server: {
      // Vite already allows localhost and IP addresses. Allow the one custom
      // hostname configured for this local site without accepting every host.
      allowedHosts: [siteHostname],
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  },
});
