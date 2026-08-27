import { BadRequestException, Logger, ValidationPipe, type ValidationError } from '@nestjs/common';

export interface ValidationLogger {
  warn(message: string): void;
}

const defaultLogger = new Logger('RequestValidation');

/**
 * Extracts property paths for undeclared / non-whitelisted properties from validation errors.
 * Never extracts or exposes payload values, authentication secrets, or PII.
 */
export function extractUndeclaredProperties(
  errors: readonly ValidationError[],
  parentPath = '',
): readonly string[] {
  const undeclared: string[] = [];

  for (const error of errors) {
    const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const [key, message] of Object.entries(error.constraints)) {
        if (
          key === 'isDefined' ||
          key === 'whitelistValidation' ||
          message.includes('should not exist')
        ) {
          undeclared.push(currentPath);
        }
      }
    }

    if (error.children && error.children.length > 0) {
      undeclared.push(...extractUndeclaredProperties(error.children, currentPath));
    }
  }

  return undeclared;
}

/**
 * Formats validation error constraint messages recursively into a flat array of strings.
 */
export function formatValidationMessages(
  errors: readonly ValidationError[],
  parentPath = '',
): readonly string[] {
  const messages: string[] = [];

  for (const error of errors) {
    const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        messages.push(message);
      }
    }

    if (error.children && error.children.length > 0) {
      messages.push(...formatValidationMessages(error.children, currentPath));
    }
  }

  return messages;
}

/**
 * Records observation for undeclared property keys without exposing body values or credentials.
 */
export function logUndeclaredPropertiesObservation(
  properties: readonly string[],
  targetName?: string,
  logger: ValidationLogger = defaultLogger,
): void {
  if (properties.length === 0) return;
  const targetLabel = targetName ? ` on ${targetName}` : '';
  logger.warn(
    `Undeclared request body properties rejected${targetLabel}: [${properties.join(', ')}]`,
  );
}

/**
 * Creates the global API ValidationPipe enforcing rejection of undeclared write-body properties.
 */
export function createApiValidationPipe(options?: {
  readonly logger?: ValidationLogger;
}): ValidationPipe {
  const logger = options?.logger ?? defaultLogger;

  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]): BadRequestException => {
      const undeclared = extractUndeclaredProperties(errors);
      if (undeclared.length > 0) {
        const target = errors[0]?.target?.constructor?.name;
        logUndeclaredPropertiesObservation(undeclared, target, logger);
      }
      const messages = formatValidationMessages(errors);
      return new BadRequestException(messages.length > 0 ? messages : 'Validation failed');
    },
  });
}
