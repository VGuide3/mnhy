import { describe, expect, it } from 'vitest';
import { TransactionEngineError } from './errors.js';

describe('TransactionEngineError', () => {
  it('carries a code, message, name, and cause', () => {
    const cause = new Error('root cause');
    const error = new TransactionEngineError('SIMULATION_ERROR', 'simulation reverted', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TransactionEngineError');
    expect(error.code).toBe('SIMULATION_ERROR');
    expect(error.message).toBe('simulation reverted');
    expect(error.cause).toBe(cause);
  });
});
