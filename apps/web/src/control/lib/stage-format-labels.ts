import { messages } from '../i18n/messages.en.js';
import type { SeriesResolutionClass } from './api-client.js';

/**
 * The localized name of each stage format the control panel offers. A format absent here is shown
 * by its own code, which is also what a discipline's own, unlisted format reads as.
 */
export const STAGE_FORMAT_LABELS: Readonly<Record<string, typeof messages.stageFormatLeague>> = {
  league: messages.stageFormatLeague,
  'round-robin': messages.stageFormatRoundRobin,
  'round-robin-home-away': messages.stageFormatRoundRobinHomeAway,
  'round-robin-single-leg': messages.stageFormatRoundRobinSingleLeg,
  'single-elimination': messages.stageFormatSingleElimination,
  'double-elimination': messages.stageFormatDoubleElimination,
};

/** The localized name of each way a series can be decided. */
export const SERIES_CLASS_LABELS: Record<
  SeriesResolutionClass,
  typeof messages.wizardSeriesClassBestOf
> = {
  'best-of': messages.wizardSeriesClassBestOf,
  aggregate: messages.wizardSeriesClassAggregate,
  'points-per-leg': messages.wizardSeriesClassPointsPerLeg,
};
