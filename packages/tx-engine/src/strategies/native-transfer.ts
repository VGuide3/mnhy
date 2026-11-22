import { TransactionEngineError } from '@web3-forge/shared';
import type {
  AuthorizationContext,
  AuthorizationRequest,
  EncodedTx,
  ExecuteContext,
  GasEstimate,
  Receipt,
  SimulationContext,
  SimulationResult,
  Strategy,
  SubmissionResult,
  ValidationResult,
} from '@web3-forge/shared';

export const NATIVE_TRANSFER_STRATEGY = 'nativeTransfer';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HEX_VALUE_PATTERN = /^0x[0-9a-fA-F]+$/;
const DECIMAL_VALUE_PATTERN = /^\d+$/;
const NATIVE_TRANSFER_GAS = 21_000n;
const DEFAULT_MOCK_BALANCE = 100n * 10n ** 18n;

export interface NativeTransferParams {
  to: string;
  value: bigint | string;
}

export interface NativeTransferStrategyOptions {
  mockBalanceWei?: bigint;
  confirmDelayMs?: number;
  confirmations?: number;
  blockNumber?: number;
  sleep?: (ms: number) => Promise<void>;
  txHashFactory?: (encoded: EncodedTx) => string;
}

interface NormalizedNativeTransferParams {
  to: string;
  value: bigint;
}

export class NativeTransferStrategy implements Strategy {
  private readonly mockBalanceWei: bigint;
  private readonly confirmDelayMs: number;
  private readonly confirmations: number;
  private readonly blockNumber: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly txHashFactory: (encoded: EncodedTx) => string;

  constructor(options: NativeTransferStrategyOptions = {}) {
    this.mockBalanceWei = options.mockBalanceWei ?? DEFAULT_MOCK_BALANCE;
    this.confirmDelayMs = options.confirmDelayMs ?? 10;
    this.confirmations = options.confirmations ?? 1;
    this.blockNumber = options.blockNumber ?? 1;
    this.sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.txHashFactory = options.txHashFactory ?? createFakeTxHash;
  }

  async validate(params: unknown): Promise<ValidationResult> {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      return { ok: false, errors: ['params must be an object'] };
    }

    const { to, value } = params as { to?: unknown; value?: unknown };
    const errors: string[] = [];

    if (typeof to !== 'string' || !ADDRESS_PATTERN.test(to)) {
      errors.push('to must be a 20-byte hex address');
    }
    if (parseTransferValue(value) === null) {
      errors.push('value must be a non-negative bigint or numeric string');
    }

    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  async encode(params: unknown): Promise<EncodedTx> {
    const normalized = this.parseParams(params);
    return {
      to: normalized.to,
      data: '0x',
      value: `0x${normalized.value.toString(16)}`,
      meta: { params: { to: normalized.to, value: normalized.value.toString() } },
    };
  }

  async simulate(encoded: EncodedTx, _context: SimulationContext): Promise<SimulationResult> {
    if (!ADDRESS_PATTERN.test(encoded.to)) {
      return { ok: false, revertReason: 'Invalid recipient address' };
    }
    if (encoded.data !== '0x') {
      return { ok: false, revertReason: 'Native transfer data must be 0x' };
    }

    const value = parseHexValue(encoded.value);
    if (value === null) {
      return { ok: false, revertReason: 'Invalid encoded value' };
    }
    if (value > this.mockBalanceWei) {
      return {
        ok: false,
        revertReason: `Insufficient mock balance: value ${value} exceeds ${this.mockBalanceWei}`,
      };
    }

    return { ok: true, gasUsed: NATIVE_TRANSFER_GAS };
  }

  async estimateGas(_encoded: EncodedTx, _context?: SimulationContext): Promise<GasEstimate> {
    return { gasLimit: Number(NATIVE_TRANSFER_GAS) };
  }

  async authorize(
    encoded: EncodedTx,
    _context?: AuthorizationContext,
  ): Promise<AuthorizationRequest> {
    return {
      type: 'wallet',
      details: { to: encoded.to, value: encoded.value ?? '0x0', data: encoded.data },
    };
  }

  async execute(
    encoded: EncodedTx,
    _auth?: unknown,
    context?: ExecuteContext,
  ): Promise<SubmissionResult> {
    const simulation = await this.simulate(encoded, context ?? {});
    if (!simulation.ok) {
      return { ok: false, error: simulation.revertReason ?? 'Simulation failed' };
    }

    const txHash = this.txHashFactory(encoded);
    if (!TX_HASH_PATTERN.test(txHash)) {
      return { ok: false, error: 'txHashFactory returned an invalid transaction hash' };
    }
    return { ok: true, txHash };
  }

  async confirm(txHash: string, timeoutMs = 60_000): Promise<Receipt> {
    if (!TX_HASH_PATTERN.test(txHash)) {
      throw new TransactionEngineError('CONFIRM_ERROR', 'Invalid transaction hash');
    }
    if (timeoutMs <= 0) {
      throw new TransactionEngineError('TIMEOUT', `Timed out waiting for transaction ${txHash}`);
    }
    if (timeoutMs < this.confirmDelayMs) {
      await this.sleep(timeoutMs);
      throw new TransactionEngineError('TIMEOUT', `Timed out waiting for transaction ${txHash}`);
    }

    await this.sleep(this.confirmDelayMs);
    return {
      status: 1,
      confirmations: this.confirmations,
      blockHash: createFakeBlockHash(txHash),
      blockNumber: this.blockNumber,
    };
  }

  private parseParams(params: unknown): NormalizedNativeTransferParams {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      throw new TransactionEngineError('VALIDATION_ERROR', 'params must be an object');
    }

    const { to, value } = params as { to?: unknown; value?: unknown };
    if (typeof to !== 'string' || !ADDRESS_PATTERN.test(to)) {
      throw new TransactionEngineError('VALIDATION_ERROR', 'to must be a 20-byte hex address');
    }

    const parsedValue = parseTransferValue(value);
    if (parsedValue === null) {
      throw new TransactionEngineError(
        'VALIDATION_ERROR',
        'value must be a non-negative bigint or numeric string',
      );
    }

    return { to, value: parsedValue };
  }
}

export function parseTransferValue(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!DECIMAL_VALUE_PATTERN.test(trimmed) && !HEX_VALUE_PATTERN.test(trimmed)) {
    return null;
  }

  try {
    const parsed = BigInt(trimmed);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function parseHexValue(value: string | undefined): bigint | null {
  if (value === undefined) return 0n;
  if (!HEX_VALUE_PATTERN.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function createFakeTxHash(encoded: EncodedTx): string {
  const input = `${encoded.to}:${encoded.value ?? '0x0'}:${encoded.data}`;
  return `0x${hashParts(input).join('')}`;
}

function createFakeBlockHash(txHash: string): string {
  return `0x${hashParts(txHash).join('')}`;
}

function hashParts(input: string): string[] {
  const seeds = [
    0x811c9dc5, 0x1b873593, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1, 0x9e3779b1, 0x7f4a7c15,
  ];
  return seeds.map((seed) => hash32(input, seed).toString(16).padStart(8, '0'));
}

function hash32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
