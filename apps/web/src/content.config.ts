import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    // capabilities/roles (openspec 0162): declared per help page so
    // scripts/check-help-coverage.mjs can gate on them, and so the roles a
    // page serves render visibly on the page itself, not only in frontmatter
    // a reader never sees.
    schema: docsSchema({
      extend: z.object({
        capabilities: z.array(z.string()).optional(),
        roles: z.array(z.string()).optional(),
      }),
    }),
  }),
};
