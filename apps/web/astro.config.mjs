// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// React is wired now but only used from /control/** routes starting at
// 0022-control-web-shell-and-org-dashboard (see openspec/changes/README.md).
export default defineConfig({
  site: process.env.COPALIBRE_SITE ?? 'http://localhost:4321',
  integrations: [react()],
});
