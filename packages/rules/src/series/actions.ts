import {
  AbstractAction,
  ExecutionResult,
  MessageType,
  type ExecutionContext,
} from '@sebasoft/neuron-js';
import type { RulesRegistry } from '../registry/rules-registry.js';

export interface SeriesResolutionState {
  readonly status: 'decided';
  readonly winnerEntrantId: string;
  readonly reason: string;
}

export class WinSeriesAction extends AbstractAction {
  static readonly TYPE = 'winSeries';

  execute(context: ExecutionContext): ExecutionResult<string | null> {
    const winner = this.params.get('winner')?.getValue(context);
    const reason = this.params.get('reason')?.getValue(context);

    if (typeof winner !== 'string' || typeof reason !== 'string') {
      return new ExecutionResult(false, context, null, [
        'winSeries requires winner (entrantId string) and reason parameters',
      ]);
    }

    const seriesResolution: SeriesResolutionState = {
      status: 'decided',
      winnerEntrantId: winner,
      reason,
    };

    const nextContext: ExecutionContext = {
      ...context,
      messages: [
        ...context.messages,
        { type: MessageType.INFO, text: `Series decided: winner is ${winner} (${reason})` },
      ],
      state: { ...context.state, seriesResolution },
    };

    return new ExecutionResult(true, nextContext, winner);
  }
}

export function registerSeriesResolutionVocabulary(registry: RulesRegistry): RulesRegistry {
  registry.registerAction(
    WinSeriesAction.TYPE,
    WinSeriesAction,
    'Declares the winning entrant for a series with an explanatory reason',
    {
      parameters: [
        {
          name: 'winner',
          description: 'Entrant ID of the winner',
          required: true,
          parameterTypes: ['simple_string'],
          allowExpression: true,
          valueSchema: { type: 'string' },
        },
        {
          name: 'reason',
          description: 'Reason for series victory',
          required: true,
          parameterTypes: ['simple_string'],
          allowExpression: true,
          valueSchema: { type: 'string' },
        },
      ],
    },
  );
  return registry;
}
