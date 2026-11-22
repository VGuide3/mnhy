import {
  EventEmitter,
  TransactionEngineError,
  TransactionState,
  isTerminalState,
} from '@web3-forge/shared';
import type {
  AuthorizationContext,
  AuthorizationRequest,
  EncodedTx,
  ExecuteContext,
  Receipt,
  SimulationContext,
  SimulationResult,
  StateChangeEvent,
  Strategy,
  SubmissionResult,
  TransactionEngineErrorCode,
  TxEvent,
  ValidationResult,
} from '@web3-forge/shared';

export interface TransactionEngineEvents {
  stateChange: StateChangeEvent;
  txEvent: TxEvent;
}

const ALLOWED_TRANSITIONS: Record<TransactionState, readonly TransactionState[]> = {
  IDLE: [
    TransactionState.VALIDATING,
    TransactionState.SIMULATING,
    TransactionState.FAILURE,
    TransactionState.CANCELLED,
  ],
  VALIDATING: [TransactionState.SIMULATING, TransactionState.FAILURE, TransactionState.CANCELLED],
  SIMULATING: [
    TransactionState.AWAITING_USER_APPROVAL,
    TransactionState.FAILURE,
    TransactionState.CANCELLED,
  ],
  AWAITING_USER_APPROVAL: [
    TransactionState.WALLET_CONFIRMATION,
    TransactionState.REJECTION,
    TransactionState.TIMEOUT,
    TransactionState.FAILURE,
    TransactionState.CANCELLED,
  ],
  WALLET_CONFIRMATION: [
    TransactionState.SUBMITTING,
    TransactionState.REJECTION,
    TransactionState.TIMEOUT,
    TransactionState.FAILURE,
    TransactionState.CANCELLED,
  ],
  SUBMITTING: [TransactionState.PENDING, TransactionState.FAILURE, TransactionState.CANCELLED],
  PENDING: [
    TransactionState.CONFIRMING,
    TransactionState.FAILURE,
    TransactionState.TIMEOUT,
    TransactionState.CANCELLED,
  ],
  CONFIRMING: [
    TransactionState.SUCCESS,
    TransactionState.FAILURE,
    TransactionState.TIMEOUT,
    TransactionState.CANCELLED,
  ],
  SUCCESS: [],
  FAILURE: [],
  REJECTION: [],
  TIMEOUT: [],
  CANCELLED: [],
};

const STRATEGY_METHODS = [
  'validate',
  'encode',
  'simulate',
  'estimateGas',
  'authorize',
  'execute',
  'confirm',
] as const;

export class TransactionEngine {
  private readonly strategies = new Map<string, Strategy>();
  private readonly txStrategies = new Map<string, string>();
  private readonly events = new EventEmitter<TransactionEngineEvents>();
  private currentState: TransactionState = TransactionState.IDLE;

  get state(): TransactionState {
    return this.currentState;
  }

  on<K extends keyof TransactionEngineEvents>(
    event: K,
    listener: (payload: TransactionEngineEvents[K]) => void,
  ): this {
    this.events.on(event, listener);
    return this;
  }

  off<K extends keyof TransactionEngineEvents>(
    event: K,
    listener: (payload: TransactionEngineEvents[K]) => void,
  ): this {
    this.events.off(event, listener);
    return this;
  }

  once<K extends keyof TransactionEngineEvents>(
    event: K,
    listener: (payload: TransactionEngineEvents[K]) => void,
  ): this {
    this.events.once(event, listener);
    return this;
  }

  removeAllListeners(event?: keyof TransactionEngineEvents): this {
    this.events.removeAllListeners(event);
    return this;
  }

  registerStrategy(name: string, strategy: Strategy): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new TransactionEngineError(
        'VALIDATION_ERROR',
        'Strategy name must be a non-empty string',
      );
    }
    if (this.strategies.has(name)) {
      throw new TransactionEngineError(
        'VALIDATION_ERROR',
        `Strategy "${name}" is already registered`,
      );
    }
    if (typeof strategy !== 'object' || strategy === null) {
      throw new TransactionEngineError('VALIDATION_ERROR', `Strategy "${name}" must be an object`);
    }
    for (const method of STRATEGY_METHODS) {
      if (typeof strategy[method] !== 'function') {
        throw new TransactionEngineError(
          'VALIDATION_ERROR',
          `Strategy "${name}" is missing ${method}()`,
        );
      }
    }
    this.strategies.set(name, strategy);
  }

  unregisterStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }

  hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  listStrategies(): string[] {
    return [...this.strategies.keys()];
  }

  getStrategy(name: string): Strategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new TransactionEngineError(
        'STRATEGY_NOT_FOUND',
        `Strategy "${name}" is not registered`,
      );
    }
    return strategy;
  }

  async validate(strategyName: string, params: unknown): Promise<ValidationResult> {
    this.assertNotTerminal('validate');
    if (this.currentState !== TransactionState.IDLE) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        `validate() requires IDLE state, received ${this.currentState}`,
      );
    }

    const strategy = this.getStrategy(strategyName);
    this.transition(TransactionState.VALIDATING, { strategy: strategyName });

    let result: ValidationResult;
    try {
      result = await strategy.validate(params);
    } catch (error) {
      const message = `Strategy "${strategyName}" validation threw`;
      this.fail('VALIDATION_ERROR', message);
      throw new TransactionEngineError('VALIDATION_ERROR', message, { cause: error });
    }

    if (!result || typeof result.ok !== 'boolean') {
      const message = `Strategy "${strategyName}" returned an invalid ValidationResult`;
      this.fail('VALIDATION_ERROR', message);
      throw new TransactionEngineError('VALIDATION_ERROR', message);
    }

    if (!result.ok) {
      this.fail('VALIDATION_ERROR', result.errors?.join('; ') || 'Validation failed');
      return result;
    }

    this.transition(TransactionState.SIMULATING, { strategy: strategyName });
    return result;
  }

  async encode(strategyName: string, params: unknown): Promise<EncodedTx> {
    this.assertNotTerminal('encode');
    const strategy = this.getStrategy(strategyName);

    let encoded: EncodedTx;
    try {
      encoded = await strategy.encode(params);
    } catch (error) {
      const message = `Strategy "${strategyName}" encoding threw`;
      this.fail('ENCODE_ERROR', message);
      throw new TransactionEngineError('ENCODE_ERROR', message, { cause: error });
    }

    if (!encoded || typeof encoded.to !== 'string' || typeof encoded.data !== 'string') {
      const message = `Strategy "${strategyName}" returned an invalid EncodedTx`;
      this.fail('ENCODE_ERROR', message);
      throw new TransactionEngineError('ENCODE_ERROR', message);
    }

    const meta =
      encoded.meta && typeof encoded.meta === 'object' && !Array.isArray(encoded.meta)
        ? encoded.meta
        : {};

    return { ...encoded, meta: { ...meta, strategy: strategyName } };
  }

  async simulate(encodedTx: EncodedTx, context: SimulationContext = {}): Promise<SimulationResult> {
    this.assertNotTerminal('simulate');
    const { name, strategy } = this.resolveStrategy(encodedTx);

    if (this.currentState === TransactionState.IDLE) {
      this.transition(TransactionState.SIMULATING, { strategy: name });
    } else if (this.currentState !== TransactionState.SIMULATING) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        `simulate() requires IDLE or SIMULATING state, received ${this.currentState}`,
      );
    }

    let result: SimulationResult;
    try {
      result = await strategy.simulate(encodedTx, context);
    } catch (error) {
      const message = `Strategy "${name}" simulation threw`;
      this.fail('SIMULATION_ERROR', message);
      throw new TransactionEngineError('SIMULATION_ERROR', message, { cause: error });
    }

    if (!result || typeof result.ok !== 'boolean') {
      const message = `Strategy "${name}" returned an invalid SimulationResult`;
      this.fail('SIMULATION_ERROR', message);
      throw new TransactionEngineError('SIMULATION_ERROR', message);
    }

    if (!result.ok) {
      this.fail('SIMULATION_ERROR', result.revertReason ?? 'Simulation failed');
      return result;
    }

    this.transition(TransactionState.AWAITING_USER_APPROVAL, { strategy: name });
    return result;
  }

  async execute(
    encodedTx: EncodedTx,
    auth?: unknown,
    context: ExecuteContext = {},
  ): Promise<SubmissionResult> {
    this.assertNotTerminal('execute');
    const { name, strategy } = this.resolveStrategy(encodedTx);

    if (this.currentState === TransactionState.IDLE) {
      this.transition(TransactionState.SIMULATING, { strategy: name });
      const simulation = await this.simulate(encodedTx, context);
      if (!simulation.ok) {
        return { ok: false, error: simulation.revertReason ?? 'Simulation failed' };
      }
    } else if (this.currentState === TransactionState.SIMULATING) {
      const simulation = await this.simulate(encodedTx, context);
      if (!simulation.ok) {
        return { ok: false, error: simulation.revertReason ?? 'Simulation failed' };
      }
    } else if (this.currentState !== TransactionState.AWAITING_USER_APPROVAL) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        `execute() requires IDLE, SIMULATING, or AWAITING_USER_APPROVAL state, received ${this.currentState}`,
      );
    }

    this.transition(TransactionState.WALLET_CONFIRMATION, { strategy: name });

    let authorization: AuthorizationRequest;
    try {
      authorization = await strategy.authorize(encodedTx, this.authorizationContext(context));
    } catch (error) {
      const code = authorizationErrorCode(error);
      this.terminate(
        code === 'USER_REJECTED' ? TransactionState.REJECTION : TransactionState.FAILURE,
        code,
        `Strategy "${name}" authorization failed`,
      );
      throw new TransactionEngineError(code, `Strategy "${name}" authorization failed`, {
        cause: error,
      });
    }

    if (
      !authorization ||
      typeof authorization !== 'object' ||
      (authorization.type !== 'wallet' && authorization.type !== 'external')
    ) {
      const message = `Strategy "${name}" returned an invalid AuthorizationRequest`;
      this.fail('WALLET_ERROR', message);
      throw new TransactionEngineError('WALLET_ERROR', message);
    }

    this.events.emit('txEvent', { type: 'authorizationRequired', payload: authorization });
    this.transition(TransactionState.SUBMITTING, { strategy: name });

    let submission: SubmissionResult;
    try {
      submission = await strategy.execute(encodedTx, auth, context);
    } catch (error) {
      const message = `Strategy "${name}" execution threw`;
      this.fail('SUBMIT_ERROR', message);
      throw new TransactionEngineError('SUBMIT_ERROR', message, { cause: error });
    }

    if (!submission || typeof submission.ok !== 'boolean') {
      const message = `Strategy "${name}" returned an invalid SubmissionResult`;
      this.fail('SUBMIT_ERROR', message);
      return { ok: false, error: message };
    }

    if (!submission.ok) {
      this.fail('SUBMIT_ERROR', submission.error ?? 'Transaction submission failed');
      return submission;
    }

    if (!submission.txHash) {
      const message = `Strategy "${name}" returned success without a txHash`;
      this.fail('SUBMIT_ERROR', message);
      return { ok: false, error: message };
    }

    this.txStrategies.set(submission.txHash, name);
    this.transition(TransactionState.PENDING, { strategy: name, txHash: submission.txHash });
    this.events.emit('txEvent', {
      type: 'txHash',
      payload: { txHash: submission.txHash, strategy: name },
    });
    return submission;
  }

  async confirm(txHash: string, timeoutMs = 60_000): Promise<Receipt> {
    this.assertNotTerminal('confirm');
    const strategyName = this.txStrategies.get(txHash);
    if (!strategyName) {
      throw new TransactionEngineError(
        'STRATEGY_NOT_FOUND',
        `No strategy is recorded for transaction "${txHash}"`,
      );
    }

    const strategy = this.getStrategy(strategyName);

    if (this.currentState === TransactionState.PENDING) {
      this.transition(TransactionState.CONFIRMING, { strategy: strategyName, txHash });
    } else if (this.currentState !== TransactionState.CONFIRMING) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        `confirm() requires PENDING or CONFIRMING state, received ${this.currentState}`,
      );
    }

    let receipt: Receipt;
    try {
      receipt = await strategy.confirm(txHash, timeoutMs);
    } catch (error) {
      const code: TransactionEngineErrorCode =
        error instanceof TransactionEngineError && error.code === 'TIMEOUT'
          ? 'TIMEOUT'
          : 'CONFIRM_ERROR';
      this.terminate(
        code === 'TIMEOUT' ? TransactionState.TIMEOUT : TransactionState.FAILURE,
        code,
        `Strategy "${strategyName}" confirmation failed for ${txHash}`,
      );
      throw new TransactionEngineError(
        code,
        `Strategy "${strategyName}" confirmation failed for ${txHash}`,
        { cause: error },
      );
    }

    if (!receipt || typeof receipt.status !== 'number') {
      const message = `Strategy "${strategyName}" returned an invalid Receipt`;
      this.fail('CONFIRM_ERROR', message);
      throw new TransactionEngineError('CONFIRM_ERROR', message);
    }

    this.events.emit('txEvent', { type: 'receipt', payload: receipt });
    this.events.emit('txEvent', {
      type: 'confirm',
      payload: { txHash, confirmations: receipt.confirmations },
    });

    if (receipt.status === 1) {
      this.transition(TransactionState.SUCCESS, { strategy: strategyName, txHash });
    } else {
      this.fail('SUBMIT_ERROR', `Transaction ${txHash} failed with status ${receipt.status}`);
    }

    return receipt;
  }

  cancel(reason = 'Transaction cancelled'): void {
    if (isTerminalState(this.currentState)) return;
    this.transition(TransactionState.CANCELLED, { reason });
  }

  reset(): void {
    if (this.currentState === TransactionState.IDLE) return;
    if (!isTerminalState(this.currentState)) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        'reset() requires a terminal state; call cancel() first',
      );
    }

    const previous = this.currentState;
    this.currentState = TransactionState.IDLE;
    this.txStrategies.clear();
    this.events.emit('stateChange', {
      previous,
      state: TransactionState.IDLE,
      meta: { reason: 'reset' },
    });
  }

  private resolveStrategy(encodedTx: EncodedTx): { name: string; strategy: Strategy } {
    const strategyName = encodedTx.meta?.strategy;
    if (typeof strategyName !== 'string' || strategyName.length === 0) {
      throw new TransactionEngineError(
        'STRATEGY_NOT_FOUND',
        'EncodedTx.meta.strategy is required; encode the transaction with this engine first',
      );
    }
    return { name: strategyName, strategy: this.getStrategy(strategyName) };
  }

  private authorizationContext(context: ExecuteContext): AuthorizationContext {
    const authorizationContext: AuthorizationContext = {};
    if (context.chainId !== undefined) authorizationContext.chainId = context.chainId;
    if (context.from !== undefined) authorizationContext.from = context.from;
    return authorizationContext;
  }

  private assertNotTerminal(method: string): void {
    if (isTerminalState(this.currentState)) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        `${method}() cannot run in terminal state ${this.currentState}; call reset() first`,
      );
    }
  }

  private transition(next: TransactionState, meta?: Record<string, unknown>): void {
    if (next === this.currentState) return;

    const allowed = ALLOWED_TRANSITIONS[this.currentState];
    if (!allowed.includes(next)) {
      throw new TransactionEngineError(
        'INVALID_STATE',
        `Invalid transition ${this.currentState} -> ${next}`,
      );
    }

    const previous = this.currentState;
    this.currentState = next;
    this.events.emit('stateChange', {
      previous,
      state: next,
      ...(meta === undefined ? {} : { meta }),
    });
  }

  private fail(code: TransactionEngineErrorCode, message: string): void {
    this.terminate(TransactionState.FAILURE, code, message);
  }

  private terminate(
    state: TransactionState,
    code: TransactionEngineErrorCode,
    message: string,
  ): void {
    if (!isTerminalState(this.currentState)) {
      this.transition(state, { code, message });
    }
    this.events.emit('txEvent', { type: 'error', payload: { code, message } });
  }
}

function authorizationErrorCode(error: unknown): TransactionEngineErrorCode {
  if (error instanceof TransactionEngineError) {
    if (error.code === 'USER_REJECTED' || error.code === 'WALLET_ERROR') {
      return error.code;
    }
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; name?: unknown };
    if (
      candidate.code === 4001 ||
      candidate.code === 'USER_REJECTED' ||
      candidate.name === 'UserRejectedError'
    ) {
      return 'USER_REJECTED';
    }
  }

  return 'WALLET_ERROR';
}
