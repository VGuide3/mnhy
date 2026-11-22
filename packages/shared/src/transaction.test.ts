import { describe, expect, it } from 'vitest';
import { TERMINAL_TRANSACTION_STATES, TransactionState, isTerminalState } from './transaction.js';

describe('transaction state helpers', () => {
  it('identifies terminal states', () => {
    const terminal = [
      TransactionState.SUCCESS,
      TransactionState.FAILURE,
      TransactionState.REJECTION,
      TransactionState.TIMEOUT,
      TransactionState.CANCELLED,
    ];
    const active = [
      TransactionState.IDLE,
      TransactionState.VALIDATING,
      TransactionState.SIMULATING,
      TransactionState.AWAITING_USER_APPROVAL,
      TransactionState.WALLET_CONFIRMATION,
      TransactionState.SUBMITTING,
      TransactionState.PENDING,
      TransactionState.CONFIRMING,
    ];

    for (const state of terminal) expect(isTerminalState(state)).toBe(true);
    for (const state of active) expect(isTerminalState(state)).toBe(false);
  });

  it('exposes exactly the terminal states', () => {
    expect([...TERMINAL_TRANSACTION_STATES]).toEqual([
      TransactionState.SUCCESS,
      TransactionState.FAILURE,
      TransactionState.REJECTION,
      TransactionState.TIMEOUT,
      TransactionState.CANCELLED,
    ]);
  });
});
