import { renderHook, waitFor } from '@testing-library/react';
import type { ControlApiClient, StageResponse } from '../../lib/api-client.js';
import { useStageName } from './use-stage-name.js';

function stage(number: number, name: string): StageResponse {
  return { stageId: `s${number}`, seasonId: 'season', number, name, format: 'round-robin' };
}

function clientWith(listStages: ControlApiClient['listStages']): ControlApiClient {
  return { listStages } as ControlApiClient;
}

describe('useStageName', () => {
  it("returns the stage's own name once the stage list arrives", async () => {
    const api = clientWith(async () => [stage(1, 'Fase de grupos'), stage(2, 'Final')]);

    const { result } = renderHook(() => useStageName(api, 'liga', 'apertura', 2));

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('Final'));
  });

  it('stays undefined for a stage the list does not hold or a blank name', async () => {
    const api = clientWith(async () => [stage(1, '   ')]);
    const missing = renderHook(() => useStageName(api, 'liga', 'apertura', 3));
    const blank = renderHook(() => useStageName(api, 'liga', 'apertura', 1));

    await Promise.resolve();
    expect(missing.result.current).toBeUndefined();
    expect(blank.result.current).toBeUndefined();
  });

  it('stays undefined when the read fails or the client cannot list stages', async () => {
    const failing = clientWith(async () => {
      throw new Error('offline');
    });
    const throwing = clientWith(() => {
      throw new Error('no fixture');
    });
    const absent = {} as ControlApiClient;

    for (const api of [failing, throwing, absent]) {
      const { result } = renderHook(() => useStageName(api, 'liga', 'apertura', 1));
      await Promise.resolve();
      expect(result.current).toBeUndefined();
    }
  });

  it("does not show a previous stage's name while the next one loads", async () => {
    const api = clientWith(async () => [stage(1, 'Fase de grupos'), stage(2, 'Final')]);

    const { result, rerender } = renderHook(
      ({ number }) => useStageName(api, 'liga', 'apertura', number),
      { initialProps: { number: 1 } },
    );
    await waitFor(() => expect(result.current).toBe('Fase de grupos'));

    rerender({ number: 2 });
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toBe('Final'));
  });
});
