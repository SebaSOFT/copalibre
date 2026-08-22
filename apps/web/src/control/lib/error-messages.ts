import type { IntlShape, MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import { ControlApiError } from './api-client.js';

export interface ErrorDetails {
  readonly errorCode?: string;
  readonly message: string;
}

export interface ErrorPresentation {
  readonly message: string;
  readonly details?: ErrorDetails;
}

const STATUS_ERROR_MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  'bad-request': messages.apiErrorBadRequest,
  unauthorized: messages.apiErrorUnauthorized,
  forbidden: messages.apiErrorForbidden,
  'not-found': messages.apiErrorNotFound,
  conflict: messages.apiErrorConflict,
  'unprocessable-entity': messages.apiErrorUnprocessableEntity,
  'service-unavailable': messages.apiErrorServiceUnavailable,
  'internal-server-error': messages.apiErrorInternalServer,
};

const CONTROLLER_ERROR_CODES = [
  'admin-module-bad-request',
  'admin-module-conflict',
  'admin-module-not-found',
  'admin-statistics-not-found',
  'auth-bad-request',
  'auth-unauthorized',
  'broadcast-service-unavailable',
  'club-conflict',
  'club-not-found',
  'data-export-not-found',
  'data-import-bad-request',
  'data-import-conflict',
  'data-import-not-found',
  'identity-media-bad-request',
  'identity-media-not-found',
  'installation-bootstrap-conflict',
  'installation-bootstrap-forbidden',
  'installation-bootstrap-service-unavailable',
  'match-control-bad-request',
  'match-control-conflict',
  'match-control-forbidden',
  'match-control-not-found',
  'organization-access-forbidden',
  'organization-access-not-found',
  'organization-bad-request',
  'organization-conflict',
  'organization-not-found',
  'participant-forbidden',
  'participant-not-found',
  'public-projection-not-found',
  'registration-bad-request',
  'registration-conflict',
  'registration-not-found',
  'report-bad-request',
  'report-not-found',
  'resource-bad-request',
  'resource-conflict',
  'resource-not-found',
  'schedule-bad-request',
  'schedule-not-found',
  'seeding-conflict',
  'seeding-not-found',
  'seeding-unprocessable-entity',
  'stage-bad-request',
  'stage-conflict',
  'stage-not-found',
  'standings-not-found',
  'table-projection-not-found',
  'tournament-bad-request',
  'tournament-conflict',
  'tournament-not-found',
  'zone-group-bad-request',
  'zone-group-conflict',
  'zone-group-not-found',
] as const;

export const ERROR_CODE_MESSAGES: Readonly<Record<string, MessageDescriptor>> = Object.freeze({
  ...STATUS_ERROR_MESSAGES,
  ...Object.fromEntries(
    CONTROLLER_ERROR_CODES.map((errorCode) => [errorCode, statusMessageFor(errorCode)]),
  ),
});

export function errorPresentation(intl: IntlShape, error: unknown): ErrorPresentation {
  if (!(error instanceof ControlApiError)) {
    return { message: intl.formatMessage(messages.apiErrorGeneric) };
  }

  const descriptor = error.errorCode ? ERROR_CODE_MESSAGES[error.errorCode] : undefined;
  if (descriptor) return { message: intl.formatMessage(descriptor) };

  return {
    message: intl.formatMessage(messages.apiErrorGeneric),
    details: {
      ...(error.errorCode ? { errorCode: error.errorCode } : {}),
      message: error.message,
    },
  };
}

function statusMessageFor(errorCode: string): MessageDescriptor {
  const statusCode = Object.keys(STATUS_ERROR_MESSAGES).find((candidate) =>
    errorCode.endsWith(`-${candidate}`),
  );
  if (!statusCode) throw new Error(`No translated status family for ${errorCode}`);
  return STATUS_ERROR_MESSAGES[statusCode] as MessageDescriptor;
}
