import { SetMetadata } from '@nestjs/common';

export const SHARED_THROTTLE_KEY = 'copalibre:shared-throttle';

/** Marks an existing strict @Throttle override as installation-wide. */
export const SharedThrottle = (): MethodDecorator => SetMetadata(SHARED_THROTTLE_KEY, true);
