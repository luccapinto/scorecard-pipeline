import { describe, expect, it } from 'vitest';

import { createDemoSource } from './demoSource';
import type { DemoAction, DemoState } from './state';
import { demoReducer, initialDemoState } from './state';

describe('demo decide', () => {
  it('moves updated_at and reports exactly what the row stores', async () => {
    // A simulation that just reached review: its last step and the decision
    // are the two writes that used to land on the same virtual instant.
    let state: DemoState = demoReducer(initialDemoState(Date.UTC(2026, 8, 21, 13)), {
      type: 'prepareSimulation',
      level: 'processed',
    });
    const source = createDemoSource(
      () => state,
      (action: DemoAction) => {
        state = demoReducer(state, action);
      },
    );
    const id = state.simulatedId!;
    const before = (await source.getInterview(id)).updated_at;

    const response = await source.decide(id, 'approve');
    const row = await source.getInterview(id);

    expect(row.status).toBe('aprovada');
    // `updated_at` moves on every write, as the backend's `onupdate` does;
    // the list projection only rebuilds a row whose stamp moved.
    expect(row.updated_at > before).toBe(true);
    expect(response.updated_at).toBe(row.updated_at);
  });
});
