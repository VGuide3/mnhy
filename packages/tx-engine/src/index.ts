import { PACKAGE_NAME as SHARED_PACKAGE, PRODUCT_NAME } from '@web3-forge/shared';

export const PACKAGE_NAME = '@web3-forge/tx-engine';

export const PACKAGE_DESCRIPTION = `Canonical transaction engine and strategies for ${PRODUCT_NAME}.`;

export const DEPENDENCIES = [SHARED_PACKAGE] as const;

export * from './engine.js';
export * from './strategies/native-transfer.js';

export {
  TransactionEngineError,
  TransactionState,
  isTerminalState,
  TERMINAL_TRANSACTION_STATES,
} from '@web3-forge/shared';

export type {
  AuthorizationContext,
  AuthorizationRequest,
  EncodedTx,
  ExecuteContext,
  GasEstimate,
  Receipt,
  SimulationContext,
  SimulationResult,
  StateChangeEvent,
  Strategy,
  SubmissionResult,
  TransactionEngineErrorCode,
  TxEvent,
  ValidationResult,
  WebChunkErrorCode,
} from '@web3-forge/shared';
