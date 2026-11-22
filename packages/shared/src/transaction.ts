import type { TransactionEngineErrorCode } from './errors.js';

export const TransactionState = {
  IDLE: 'IDLE',
  VALIDATING: 'VALIDATING',
  SIMULATING: 'SIMULATING',
  AWAITING_USER_APPROVAL: 'AWAITING_USER_APPROVAL',
  WALLET_CONFIRMATION: 'WALLET_CONFIRMATION',
  SUBMITTING: 'SUBMITTING',
  PENDING: 'PENDING',
  CONFIRMING: 'CONFIRMING',
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  REJECTION: 'REJECTION',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;

export type TransactionState = (typeof TransactionState)[keyof typeof TransactionState];

export const TERMINAL_TRANSACTION_STATES: ReadonlySet<TransactionState> = new Set([
  TransactionState.SUCCESS,
  TransactionState.FAILURE,
  TransactionState.REJECTION,
  TransactionState.TIMEOUT,
  TransactionState.CANCELLED,
]);

export function isTerminalState(state: TransactionState): boolean {
  return TERMINAL_TRANSACTION_STATES.has(state);
}

export type HexString = `0x${string}`;

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export interface EncodedTx {
  to: string;
  data: string;
  value?: string;
  gasLimit?: number;
  meta?: Record<string, unknown>;
}

export interface SimulationResult {
  ok: boolean;
  gasUsed?: bigint;
  revertReason?: string;
  logs?: unknown;
  stateDiff?: unknown;
}

export interface GasEstimate {
  gasLimit: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface AuthorizationRequest {
  type: 'wallet' | 'external';
  details: unknown;
}

export interface SubmissionResult {
  ok: boolean;
  txHash?: string;
  error?: string;
}

export interface Receipt {
  status: number;
  confirmations: number;
  blockHash?: string;
  blockNumber?: number;
  logs?: unknown;
}

export interface SimulationContext {
  chainId?: number;
  from?: string;
  [key: string]: unknown;
}

export interface AuthorizationContext {
  chainId?: number;
  from?: string;
  [key: string]: unknown;
}

export type ExecuteContext = SimulationContext;

export interface Strategy {
  validate(params: unknown): Promise<ValidationResult>;
  encode(params: unknown): Promise<EncodedTx>;
  simulate(encoded: EncodedTx, context: SimulationContext): Promise<SimulationResult>;
  estimateGas(encoded: EncodedTx, context?: SimulationContext): Promise<GasEstimate>;
  authorize(encoded: EncodedTx, context?: AuthorizationContext): Promise<AuthorizationRequest>;
  execute(encoded: EncodedTx, auth?: unknown, context?: ExecuteContext): Promise<SubmissionResult>;
  confirm(txHash: string, timeoutMs?: number): Promise<Receipt>;
}

export interface StateChangeEvent {
  previous: TransactionState;
  state: TransactionState;
  meta?: Record<string, unknown>;
}

export type TxEvent =
  | { type: 'authorizationRequired'; payload: AuthorizationRequest }
  | { type: 'txHash'; payload: { txHash: string; strategy: string } }
  | { type: 'receipt'; payload: Receipt }
  | { type: 'confirm'; payload: { txHash: string; confirmations: number } }
  | { type: 'error'; payload: { code: TransactionEngineErrorCode; message: string } };
