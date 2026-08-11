import { MAX_CSV_IMPORT_BYTES } from '@copalibre/domain';

/** Allows a 4 MiB CSV plus its small JSON request envelope. */
export const API_BODY_LIMIT_BYTES = MAX_CSV_IMPORT_BYTES + 64 * 1024;
