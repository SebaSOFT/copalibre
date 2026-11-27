import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationProjects } from './scripts/jest-integration-projects.mjs';

export default {
  // Measured on 2026-11-19 on an 8-core Linux (WSL2) machine with 15 GB RAM and the postgres:18 development
  // container, three root runs per count. Median wall time: 36 s at 7 workers, 42 s at 4, 48 s at 3, 62 s at 2.
  // Fewer workers lowered the summed file time, but no count below 7 lowered the wall time. Seven is the
  // lowest-wall count that does not raise the summed file time, so it is declared here, not left to the core count.
  maxWorkers: 7,
  projects: integrationProjects(path.dirname(fileURLToPath(import.meta.url))),
};
