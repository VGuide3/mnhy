import { describe, expect, it } from 'vitest';
import { NativeTransferStrategy, TransactionEngine, TransactionState } from './index.js';

const TO = '0x000000000000000000000000000000000000dEaD';
const ONE_ETH = 10n ** 18n;

describe('native transfer integration', () => {
  it('runs validate -> encode -> simulate -> execute -> confirm', async () => {
    const engine = new TransactionEngine();
    engine.registerStrategy(
      'nativeTransfer',
      new NativeTransferStrategy({ sleep: async () => {} }),
    );

    const states: TransactionState[] = [];
    engine.on('stateChange', (event) => states.push(event.state));

    const params = { to: TO, value: ONE_ETH };
    await expect(engine.validate('nativeTransfer', params)).resolves.toEqual({ ok: true });

    const encoded = await engine.encode('nativeTransfer', params);
    expect(encoded).toEqual({
      to: TO,
      data: '0x',
      value: '0xde0b6b3a7640000',
      meta: { params: { to: TO, value: ONE_ETH.toString() }, strategy: 'nativeTransfer' },
    });

    await expect(engine.simulate(encoded, { chainId: 1 })).resolves.toEqual({
      ok: true,
      gasUsed: 21_000n,
    });

    const submission = await engine.execute(encoded, { approved: true }, { chainId: 1 });
    expect(submission.ok).toBe(true);
    if (!submission.txHash) throw new Error('expected a transaction hash');

    const receipt = await engine.confirm(submission.txHash, 5_000);
    expect(receipt).toMatchObject({ status: 1, confirmations: 1, blockNumber: 1 });
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
  });

  it('stops at FAILURE when the native transfer exceeds the mock balance', async () => {
    const engine = new TransactionEngine();
    engine.registerStrategy(
      'nativeTransfer',
      new NativeTransferStrategy({ sleep: async () => {} }),
    );

    const params = { to: TO, value: 101n * ONE_ETH };
    await engine.validate('nativeTransfer', params);
    const encoded = await engine.encode('nativeTransfer', params);

    const simulation = await engine.simulate(encoded);
    expect(simulation.ok).toBe(false);
    expect(engine.state).toBe(TransactionState.FAILURE);

    await expect(engine.execute(encoded)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
