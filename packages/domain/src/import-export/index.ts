/**
 * CSV import and export, reachable as `@copalibre/domain/import-export`.
 *
 * Deliberately not re-exported from the package barrel. `csv-parse` and
 * `csv-stringify` read `Buffer` at module scope, so any consumer that loads the
 * barrel loads Node-only code — harmless for a server, and harmless for the
 * browser only because a production bundler tree-shakes it away. Nothing that
 * runs in a browser should depend on an optimization for its correctness, and
 * anything that loads the barrel without tree-shaking (a dev server, the
 * component workbench) fails outright.
 *
 * Every consumer of these is server-side: the API's import/export controllers,
 * the worker's import job, and the persistence repository that stores a
 * preview. No browser code imports any of it.
 */
export {
  MAX_CSV_IMPORT_BYTES,
  validateCsvImport,
  type ParticipantImportTarget,
  type CsvImportTarget,
  type CsvImportError,
  type CsvImportPreview,
  type CsvImportPreviewRow,
} from './csv-import.js';
export { stringifyCsv, escapeCsvFormulaCell } from './csv-export.js';
