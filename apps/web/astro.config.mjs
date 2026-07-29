// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// React is wired now but only used from /control/** routes starting at
// phase 0014-control-web-shell-and-org-dashboard (see openspec/changes/README.md).
export default defineConfig({
  integrations: [react()],
});
