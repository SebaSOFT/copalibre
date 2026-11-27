import { SetMetadata } from '@nestjs/common';

export const SHARED_THROTTLE_KEY = 'copalibre:shared-throttle';

export type SharedThrottleTracker = 'principal' | 'refresh-cookie';

/** Marks an existing strict @Throttle override as installation-wide. */
export const SharedThrottle = (tracker: SharedThrottleTracker = 'principal'): MethodDecorator =>
  SetMetadata(SHARED_THROTTLE_KEY, tracker);
