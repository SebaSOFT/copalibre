/** Typed errors for the rules adapter, mirroring packages/domain's style. */
export abstract class RulesError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnregisteredElementError extends RulesError {
  readonly code = 'UNREGISTERED_RULE_ELEMENT';
}

export class ScriptValidationError extends RulesError {
  readonly code = 'RULE_SCRIPT_INVALID';
}

export class GuardEvaluationError extends RulesError {
  readonly code = 'GUARD_EVALUATION_FAILED';
}

export class NotificationRuleError extends RulesError {
  readonly code = 'NOTIFICATION_RULE_INVALID';
}
