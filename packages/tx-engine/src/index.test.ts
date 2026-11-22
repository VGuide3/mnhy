import { describe, expect, it } from 'vitest';
import {
  DEPENDENCIES,
  NATIVE_TRANSFER_STRATEGY,
  NativeTransferStrategy,
  PACKAGE_DESCRIPTION,
  PACKAGE_NAME,
  TransactionEngine,
  TransactionState,
} from './index.js';

describe('@web3-forge/tx-engine', () => {
  it('exports its package identity', () => {
    expect(PACKAGE_NAME).toBe('@web3-forge/tx-engine');
    expect(PACKAGE_DESCRIPTION).toContain('transaction engine');
    expect(DEPENDENCIES).toContain('@web3-forge/shared');
  });

  it('exports the engine, state machine, and native transfer strategy', () => {
    expect(TransactionEngine).toBeTypeOf('function');
    expect(TransactionState.IDLE).toBe('IDLE');
    expect(NATIVE_TRANSFER_STRATEGY).toBe('nativeTransfer');
    expect(new NativeTransferStrategy()).toBeInstanceOf(NativeTransferStrategy);
  });
});
