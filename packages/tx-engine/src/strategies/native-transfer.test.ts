import { describe, expect, it, vi } from 'vitest';
import { NativeTransferStrategy, parseTransferValue } from './native-transfer.js';

const TO = '0x000000000000000000000000000000000000dEaD';
const ONE_ETH = 10n ** 18n;
const TX_HASH = `0x${'cd'.repeat(32)}`;

describe('NativeTransferStrategy', () => {
  it('reports validation errors for bad inputs', async () => {
    const strategy = new NativeTransferStrategy();

    await expect(strategy.validate(null)).resolves.toEqual({
      ok: false,
      errors: ['params must be an object'],
    });
    await expect(strategy.validate({ to: '0x123', value: ONE_ETH })).resolves.toEqual({
      ok: false,
      errors: ['to must be a 20-byte hex address'],
    });
    await expect(strategy.validate({ to: TO, value: -1n })).resolves.toEqual({
      ok: false,
      errors: ['value must be a non-negative bigint or numeric string'],
    });
    await expect(strategy.validate({ to: TO, value: '1.5' })).resolves.toEqual({
      ok: false,
      errors: ['value must be a non-negative bigint or numeric string'],
    });
    await expect(strategy.validate({ to: 'bad', value: 'bad' })).resolves.toEqual({
      ok: false,
      errors: [
        'to must be a 20-byte hex address',
        'value must be a non-negative bigint or numeric string',
      ],
    });
  });

  it('accepts bigint, decimal string, and hex string values', async () => {
    const strategy = new NativeTransferStrategy();

    await expect(strategy.validate({ to: TO, value: ONE_ETH })).resolves.toEqual({ ok: true });
    await expect(strategy.validate({ to: TO, value: ONE_ETH.toString() })).resolves.toEqual({
      ok: true,
    });
    await expect(strategy.validate({ to: TO, value: '0xde0b6b3a7640000' })).resolves.toEqual({
      ok: true,
    });
  });

  it('encodes a native transfer with a hex value', async () => {
    const strategy = new NativeTransferStrategy();
    const encoded = await strategy.encode({ to: TO, value: ONE_ETH });

    expect(encoded).toEqual({
      to: TO,
      data: '0x',
      value: '0xde0b6b3a7640000',
      meta: { params: { to: TO, value: ONE_ETH.toString() } },
    });
  });

  it('rejects invalid params during encode', async () => {
    const strategy = new NativeTransferStrategy();

    await expect(strategy.encode({ to: 'bad', value: 1n })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('simulates success within the mock balance and failure above it', async () => {
    const strategy = new NativeTransferStrategy({ mockBalanceWei: 100n * ONE_ETH });

    await expect(
      strategy.simulate({ to: TO, data: '0x', value: `0x${ONE_ETH.toString(16)}` }, {}),
    ).resolves.toEqual({ ok: true, gasUsed: 21_000n });

    const failure = await strategy.simulate(
      { to: TO, data: '0x', value: `0x${(101n * ONE_ETH).toString(16)}` },
      {},
    );
    expect(failure.ok).toBe(false);
    expect(failure.revertReason).toContain('Insufficient mock balance');
  });

  it('rejects malformed encoded transactions during simulation', async () => {
    const strategy = new NativeTransferStrategy();

    await expect(
      strategy.simulate({ to: 'bad', data: '0x', value: '0x0' }, {}),
    ).resolves.toMatchObject({
      ok: false,
      revertReason: 'Invalid recipient address',
    });
    await expect(
      strategy.simulate({ to: TO, data: '0x123', value: '0x0' }, {}),
    ).resolves.toMatchObject({
      ok: false,
      revertReason: 'Native transfer data must be 0x',
    });
    await expect(
      strategy.simulate({ to: TO, data: '0x', value: 'not-hex' }, {}),
    ).resolves.toMatchObject({
      ok: false,
      revertReason: 'Invalid encoded value',
    });
  });

  it('returns a deterministic fake tx hash on execute', async () => {
    const strategy = new NativeTransferStrategy();
    const encoded = await strategy.encode({ to: TO, value: ONE_ETH });

    const first = await strategy.execute(encoded);
    const second = await strategy.execute(encoded);

    expect(first.ok).toBe(true);
    expect(first.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(second.txHash).toBe(first.txHash);
  });

  it('fails execute when the transfer exceeds the mock balance', async () => {
    const strategy = new NativeTransferStrategy();
    const encoded = await strategy.encode({ to: TO, value: 101n * ONE_ETH });

    const result = await strategy.execute(encoded);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Insufficient mock balance');
  });

  it('rejects an invalid custom tx hash', async () => {
    const strategy = new NativeTransferStrategy({ txHashFactory: () => '0x123' });
    const encoded = await strategy.encode({ to: TO, value: ONE_ETH });

    await expect(strategy.execute(encoded)).resolves.toEqual({
      ok: false,
      error: 'txHashFactory returned an invalid transaction hash',
    });
  });

  it('returns a fake receipt after the configured delay', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const strategy = new NativeTransferStrategy({
      sleep,
      confirmDelayMs: 25,
      confirmations: 3,
      blockNumber: 42,
    });

    const receipt = await strategy.confirm(TX_HASH);

    expect(sleep).toHaveBeenCalledWith(25);
    expect(receipt).toMatchObject({ status: 1, confirmations: 3, blockNumber: 42 });
    expect(receipt.blockHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('rejects an invalid transaction hash', async () => {
    const strategy = new NativeTransferStrategy({ sleep: async () => {} });

    await expect(strategy.confirm('0x123')).rejects.toMatchObject({ code: 'CONFIRM_ERROR' });
  });

  it('times out without sleeping when the timeout is zero', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const strategy = new NativeTransferStrategy({ sleep });

    await expect(strategy.confirm(TX_HASH, 0)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('times out after sleeping when the delay exceeds the timeout', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const strategy = new NativeTransferStrategy({ sleep, confirmDelayMs: 50 });

    await expect(strategy.confirm(TX_HASH, 10)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('estimates gas and builds a wallet authorization request', async () => {
    const strategy = new NativeTransferStrategy();
    const encoded = await strategy.encode({ to: TO, value: ONE_ETH });

    await expect(strategy.estimateGas(encoded)).resolves.toEqual({ gasLimit: 21_000 });
    await expect(strategy.authorize(encoded)).resolves.toMatchObject({
      type: 'wallet',
      details: { to: TO, value: '0xde0b6b3a7640000', data: '0x' },
    });
  });
});

describe('parseTransferValue', () => {
  it('parses decimal and hex strings', () => {
    expect(parseTransferValue('001')).toBe(1n);
    expect(parseTransferValue('0x10')).toBe(16n);
    expect(parseTransferValue(ONE_ETH)).toBe(ONE_ETH);
  });

  it('rejects negative, non-numeric, and non-string values', () => {
    expect(parseTransferValue(-1n)).toBeNull();
    expect(parseTransferValue('1.5')).toBeNull();
    expect(parseTransferValue(1)).toBeNull();
    expect(parseTransferValue(null)).toBeNull();
  });
});
