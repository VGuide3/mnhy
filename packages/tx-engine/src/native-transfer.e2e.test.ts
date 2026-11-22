import { describe, expect, it } from 'vitest';
import { NativeTransferStrategy, TransactionEngine, TransactionState } from './index.js';
import type { TxEvent } from './index.js';

const TO = '0x000000000000000000000000000000000000dEaD';
const ONE_ETH = 10n ** 18n;

describe('native transfer end-to-end', () => {
  it('executes a full transfer and records state and transaction events', async () => {
    const engine = new TransactionEngine();
    engine.registerStrategy(
      'nativeTransfer',
      new NativeTransferStrategy({ sleep: async () => {} }),
    );

    const states: TransactionState[] = [];
    const txEvents: TxEvent[] = [];
    engine.on('stateChange', (event) => states.push(event.state));
    engine.on('txEvent', (event) => txEvents.push(event));

    const params = { to: TO, value: ONE_ETH.toString() };
    await expect(engine.validate('nativeTransfer', params)).resolves.toEqual({ ok: true });
    const encoded = await engine.encode('nativeTransfer', params);

    const submission = await engine.execute(encoded, { approved: true }, { chainId: 1 });
    expect(submission.ok).toBe(true);
    if (!submission.txHash) throw new Error('expected a transaction hash');

    const receipt = await engine.confirm(submission.txHash, 1_000);
    expect(receipt.status).toBe(1);
    expect(engine.state).toBe(TransactionState.SUCCESS);

    expect(states).toEqual([
      TransactionState.VALIDATING,
      TransactionState.SIMULATING,
      TransactionState.AWAITING_USER_APPROVAL,
      TransactionState.WALLET_CONFIRMATION,
      TransactionState.SUBMITTING,
      TransactionState.PENDING,
      TransactionState.CONFIRMING,
      TransactionState.SUCCESS,
    ]);
    expect(txEvents.map((event) => event.type)).toEqual([
      'authorizationRequired',
      'txHash',
      'receipt',
      'confirm',
    ]);
    expect(txEvents).toContainEqual({
      type: 'txHash',
      payload: { txHash: submission.txHash, strategy: 'nativeTransfer' },
    });
  });
});
