export type WebChunkErrorCode =
  | 'VALIDATION_ERROR'
  | 'SIMULATION_ERROR'
  | 'USER_REJECTED'
  | 'WALLET_ERROR'
  | 'SUBMIT_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PERMISSION_DENIED';

export type TransactionEngineErrorCode =
  WebChunkErrorCode | 'STRATEGY_NOT_FOUND' | 'INVALID_STATE' | 'ENCODE_ERROR' | 'CONFIRM_ERROR';

export class TransactionEngineError extends Error {
  readonly code: TransactionEngineErrorCode;

  constructor(code: TransactionEngineErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransactionEngineError';
    this.code = code;
  }
}
