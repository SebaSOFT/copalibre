import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationProjects } from './scripts/jest-integration-projects.mjs';

export default {
  projects: integrationProjects(path.dirname(fileURLToPath(import.meta.url))),
};
