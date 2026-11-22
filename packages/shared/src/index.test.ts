import { describe, expect, it } from 'vitest';
import {
  PACKAGE_DESCRIPTION,
  PACKAGE_NAME,
  PRODUCT_NAME,
  TransactionState,
  isTerminalState,
} from './index.js';

describe('@web3-forge/shared', () => {
  it('exports its package identity', () => {
    expect(PACKAGE_NAME).toBe('@web3-forge/shared');
    expect(PACKAGE_DESCRIPTION).toContain('Shared types');
    expect(PRODUCT_NAME).toBe('Web3 Forge');
  });

  it('exports transaction domain helpers', () => {
    expect(TransactionState.IDLE).toBe('IDLE');
    expect(isTerminalState(TransactionState.SUCCESS)).toBe(true);
    expect(isTerminalState(TransactionState.PENDING)).toBe(false);
  });
});
