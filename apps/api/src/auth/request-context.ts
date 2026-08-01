/**
 * Moved to `@copalibre/auth` in 0018, when `apps/events` needed the same
 * verified-subject shape. Re-exported here so the phase that introduced these
 * imports keeps its own vocabulary.
 */
export { hasScope, type AuthenticatedSubject, type RequestWithSubject } from '@copalibre/auth';
