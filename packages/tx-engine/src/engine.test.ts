import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionEngineError, TransactionState } from '@web3-forge/shared';
import type {
  AuthorizationRequest,
  EncodedTx,
  GasEstimate,
  Receipt,
  SimulationResult,
  Strategy,
  SubmissionResult,
  TxEvent,
  ValidationResult,
} from '@web3-forge/shared';
import { TransactionEngine } from './engine.js';

const TO = '0x000000000000000000000000000000000000dEaD';
const TX_HASH = `0x${'ab'.repeat(32)}`;

class DummyStrategy implements Strategy {
  readonly validate = vi.fn(async (_params: unknown): Promise<ValidationResult> => ({ ok: true }));
  readonly encode = vi.fn(async (_params: unknown): Promise<EncodedTx> => ({
    to: TO,
    data: '0x',
    value: '0x1',
  }));
  readonly simulate = vi.fn(async (): Promise<SimulationResult> => ({
    ok: true,
    gasUsed: 21_000n,
  }));
  readonly estimateGas = vi.fn(async (): Promise<GasEstimate> => ({ gasLimit: 21_000 }));
  readonly authorize = vi.fn(async (): Promise<AuthorizationRequest> => ({
    type: 'wallet',
    details: {},
  }));
  readonly execute = vi.fn(async (): Promise<SubmissionResult> => ({ ok: true, txHash: TX_HASH }));
  readonly confirm = vi.fn(async (): Promise<Receipt> => ({ status: 1, confirmations: 2 }));
}

describe('TransactionEngine', () => {
  let engine: TransactionEngine;
  let strategy: DummyStrategy;

  beforeEach(() => {
    engine = new TransactionEngine();
    strategy = new DummyStrategy();
    engine.registerStrategy('dummy', strategy);
  });

  it('runs the happy path through every state', async () => {
    const states: TransactionState[] = [];
    const events: TxEvent[] = [];
    engine.on('stateChange', (event) => states.push(event.state));
    engine.on('txEvent', (event) => events.push(event));

    const params = { amount: 1 };

    await expect(engine.validate('dummy', params)).resolves.toEqual({ ok: true });
    expect(engine.state).toBe(TransactionState.SIMULATING);

    const encoded = await engine.encode('dummy', params);
    expect(encoded.meta?.strategy).toBe('dummy');

    await expect(engine.simulate(encoded)).resolves.toEqual({ ok: true, gasUsed: 21_000n });
    expect(engine.state).toBe(TransactionState.AWAITING_USER_APPROVAL);

    const submission = await engine.execute(encoded, { signed: true });
    expect(submission).toEqual({ ok: true, txHash: TX_HASH });
    expect(engine.state).toBe(TransactionState.PENDING);

    const receipt = await engine.confirm(TX_HASH);
    expect(receipt).toEqual({ status: 1, confirmations: 2 });
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
    expect(events.map((event) => event.type)).toEqual([
      'authorizationRequired',
      'txHash',
      'receipt',
      'confirm',
    ]);

    expect(strategy.validate).toHaveBeenCalledWith(params);
    expect(strategy.encode).toHaveBeenCalledWith(params);
    expect(strategy.simulate).toHaveBeenCalledWith(encoded, {});
    expect(strategy.authorize).toHaveBeenCalledWith(encoded, {});
    expect(strategy.execute).toHaveBeenCalledWith(encoded, { signed: true }, {});
    expect(strategy.confirm).toHaveBeenCalledWith(TX_HASH, 60_000);
  });

  it('simulates during execute when the engine is still in SIMULATING', async () => {
    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});

    const submission = await engine.execute(encoded);

    expect(submission).toEqual({ ok: true, txHash: TX_HASH });
    expect(strategy.simulate).toHaveBeenCalledTimes(1);
    expect(strategy.authorize).toHaveBeenCalledTimes(1);
    expect(strategy.execute).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe(TransactionState.PENDING);
  });

  it('simulates and submits when execute starts from IDLE', async () => {
    const encoded: EncodedTx = {
      to: TO,
      data: '0x',
      value: '0x1',
      meta: { strategy: 'dummy' },
    };

    const submission = await engine.execute(encoded);

    expect(submission).toEqual({ ok: true, txHash: TX_HASH });
    expect(strategy.simulate).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe(TransactionState.PENDING);
  });

  it('moves to FAILURE and emits an error when simulation fails', async () => {
    strategy.simulate.mockResolvedValueOnce({
      ok: false,
      revertReason: 'execution reverted',
    });
    const states: TransactionState[] = [];
    const events: TxEvent[] = [];
    engine.on('stateChange', (event) => states.push(event.state));
    engine.on('txEvent', (event) => events.push(event));

    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});
    const result = await engine.simulate(encoded);

    expect(result).toEqual({ ok: false, revertReason: 'execution reverted' });
    expect(engine.state).toBe(TransactionState.FAILURE);
    expect(states).toEqual([
      TransactionState.VALIDATING,
      TransactionState.SIMULATING,
      TransactionState.FAILURE,
    ]);
    expect(events).toContainEqual({
      type: 'error',
      payload: { code: 'SIMULATION_ERROR', message: 'execution reverted' },
    });
    expect(strategy.execute).not.toHaveBeenCalled();
  });

  it('does not authorize or submit when execute simulation fails', async () => {
    strategy.simulate.mockResolvedValueOnce({ ok: false, revertReason: 'reverted' });

    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});
    const result = await engine.execute(encoded);

    expect(result).toEqual({ ok: false, error: 'reverted' });
    expect(engine.state).toBe(TransactionState.FAILURE);
    expect(strategy.authorize).not.toHaveBeenCalled();
    expect(strategy.execute).not.toHaveBeenCalled();
  });

  it('moves to FAILURE when validation returns errors', async () => {
    strategy.validate.mockResolvedValueOnce({
      ok: false,
      errors: ['bad to', 'bad value'],
    });
    const events: TxEvent[] = [];
    engine.on('txEvent', (event) => events.push(event));

    const result = await engine.validate('dummy', {});

    expect(result).toEqual({ ok: false, errors: ['bad to', 'bad value'] });
    expect(engine.state).toBe(TransactionState.FAILURE);
    expect(events).toContainEqual({
      type: 'error',
      payload: { code: 'VALIDATION_ERROR', message: 'bad to; bad value' },
    });
    expect(strategy.simulate).not.toHaveBeenCalled();
  });

  it('moves to REJECTION when authorization is rejected', async () => {
    strategy.authorize.mockRejectedValueOnce(
      Object.assign(new Error('User denied'), { code: 4001 }),
    );

    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});
    await engine.simulate(encoded);

    await expect(engine.execute(encoded)).rejects.toMatchObject({ code: 'USER_REJECTED' });
    expect(engine.state).toBe(TransactionState.REJECTION);
    expect(strategy.execute).not.toHaveBeenCalled();
  });

  it('moves to FAILURE when authorization returns an invalid request', async () => {
    strategy.authorize.mockResolvedValueOnce(undefined as unknown as AuthorizationRequest);

    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});
    await engine.simulate(encoded);

    await expect(engine.execute(encoded)).rejects.toMatchObject({ code: 'WALLET_ERROR' });
    expect(engine.state).toBe(TransactionState.FAILURE);
    expect(strategy.execute).not.toHaveBeenCalled();
  });

  it('moves to FAILURE when the receipt status is not 1', async () => {
    strategy.confirm.mockResolvedValueOnce({ status: 0, confirmations: 1 });

    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});
    await engine.simulate(encoded);
    await engine.execute(encoded);

    const receipt = await engine.confirm(TX_HASH);

    expect(receipt.status).toBe(0);
    expect(engine.state).toBe(TransactionState.FAILURE);
  });

  it('moves to TIMEOUT when confirmation times out', async () => {
    strategy.confirm.mockRejectedValueOnce(new TransactionEngineError('TIMEOUT', 'timed out'));

    await engine.validate('dummy', {});
    const encoded = await engine.encode('dummy', {});
    await engine.simulate(encoded);
    await engine.execute(encoded);

    await expect(engine.confirm(TX_HASH)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(engine.state).toBe(TransactionState.TIMEOUT);
  });

  it('rejects duplicate registrations and unknown strategies', () => {
    expect(() => engine.registerStrategy('dummy', strategy)).toThrowError(/already registered/);
    expect(() => engine.getStrategy('missing')).toThrowError(/not registered/);
    expect(engine.hasStrategy('dummy')).toBe(true);
    expect(engine.listStrategies()).toEqual(['dummy']);
  });

  it('requires a strategy name on encoded transactions', async () => {
    await expect(engine.simulate({ to: TO, data: '0x' })).rejects.toMatchObject({
      code: 'STRATEGY_NOT_FOUND',
    });
    expect(engine.state).toBe(TransactionState.IDLE);
  });

  it('requires a terminal state before reset', async () => {
    await engine.validate('dummy', {});
    expect(() => engine.reset()).toThrowError(/terminal state/);

    engine.cancel();
    expect(engine.state).toBe(TransactionState.CANCELLED);

    engine.reset();
    expect(engine.state).toBe(TransactionState.IDLE);
  });
});
