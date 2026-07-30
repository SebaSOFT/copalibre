/**
 * Who authored a publishable artifact, where it came from, and under what
 * licence. Required on every discipline and tournament profile so a
 * community-authored module states its provenance in the artifact itself
 * rather than in an external index.
 *
 * No checksum: integrity of a downloaded module belongs to the distribution
 * layer (0030-community-module-distribution), not to the domain model.
 */
export interface Attribution {
  /** Person or organisation credited as the author. */
  readonly author: string;
  /** Where the module is published, e.g. its repository URL. */
  readonly sourceUrl?: string;
  /** SPDX identifier where possible, e.g. "CC-BY-4.0" or "AGPL-3.0-only". */
  readonly licence: string;
  /** Optional contact for questions about the module. */
  readonly contact?: string;
}
