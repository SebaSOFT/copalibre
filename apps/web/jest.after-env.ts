import { beforeEach } from '@jest/globals';
import { clearResilientReadCache } from './src/control/components/pages/use-resilient-read.js';

// Navigation within one test shares data; independent tests start a new session.
beforeEach(() => clearResilientReadCache());
