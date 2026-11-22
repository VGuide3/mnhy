# @web3-forge/tx-engine

Canonical transaction engine and built-in strategies. The engine owns the transaction state
machine, strategy registry, and lifecycle events. It performs no RPC calls by itself; strategies
provide validation, encoding, simulation, authorization, execution, and confirmation.

## Usage

```ts
import {
  NATIVE_TRANSFER_STRATEGY,
  NativeTransferStrategy,
  TransactionEngine,
} from '@web3-forge/tx-engine';

const engine = new TransactionEngine();
engine.registerStrategy(NATIVE_TRANSFER_STRATEGY, new NativeTransferStrategy());

engine.on('stateChange', ({ previous, state }) => {
  console.log(`${previous} -> ${state}`);
});
engine.on('txEvent', (event) => {
  console.log(event.type, event.payload);
});

const params = {
  to: '0x000000000000000000000000000000000000dEaD',
  value: 1_000_000_000_000_000_000n,
};

const validation = await engine.validate(NATIVE_TRANSFER_STRATEGY, params);
if (!validation.ok) throw new Error(validation.errors?.join('; '));

const encoded = await engine.encode(NATIVE_TRANSFER_STRATEGY, params);
const simulation = await engine.simulate(encoded, { chainId: 1 });
if (!simulation.ok) throw new Error(simulation.revertReason);

const submission = await engine.execute(encoded, { approved: true }, { chainId: 1 });
if (!submission.ok || !submission.txHash) throw new Error(submission.error);

const receipt = await engine.confirm(submission.txHash, 5_000);
console.log(submission.txHash, receipt);
```

`execute()` runs simulation automatically when the engine is in `IDLE` or `SIMULATING`. If
`simulate()` already ran, `execute()` starts from `AWAITING_USER_APPROVAL`.

## State machine

```text
IDLE -> VALIDATING -> SIMULATING -> AWAITING_USER_APPROVAL -> WALLET_CONFIRMATION
     -> SUBMITTING -> PENDING -> CONFIRMING -> SUCCESS / FAILURE

Terminal states: SUCCESS, FAILURE, REJECTION, TIMEOUT, CANCELLED
```

`stateChange` is emitted for every transition. `txEvent` is emitted for authorization requests,
transaction hashes, receipts, confirmations, and errors. Call `reset()` after a terminal state to
reuse the engine, or `cancel()` to move an active transaction to `CANCELLED`.

## Strategy registry

```ts
engine.registerStrategy('myStrategy', strategy);
engine.hasStrategy('myStrategy');
engine.listStrategies();
engine.unregisterStrategy('myStrategy');
```

Registering the same name twice throws. Strategies must implement `validate`, `encode`,
`simulate`, `estimateGas`, `authorize`, `execute`, and `confirm`.

`encode()` adds `meta.strategy` to the returned `EncodedTx`. `simulate()` and `execute()` use that
field to resolve the strategy, so encode transactions through the engine rather than constructing
them by hand.

## Native transfer strategy

`NativeTransferStrategy` is a deterministic stub for tests and local development:

- Validates a 20-byte `to` address and a non-negative `value` supplied as a bigint, decimal string,
  or hex string.
- Encodes `{ to, data: '0x', value: <hex> }`.
- Simulates against a mock balance of 100 ETH by default.
- Returns a deterministic fake transaction hash from `execute()`.
- Returns a fake successful receipt from `confirm()` after `confirmDelayMs` (10 ms by default).

Options:

```ts
new NativeTransferStrategy({
  mockBalanceWei: 100n * 10n ** 18n,
  confirmDelayMs: 10,
  confirmations: 1,
  blockNumber: 1,
  sleep: async (ms) => {},
  txHashFactory: (encoded) => `0x${'ab'.repeat(32)}`,
});
```

Inject `sleep` in tests to avoid real timers. `confirm(txHash, 0)` rejects with `TIMEOUT`; a
timeout shorter than `confirmDelayMs` sleeps for the timeout and then rejects.

## Commands

```bash
pnpm --filter @web3-forge/tx-engine build
pnpm --filter @web3-forge/tx-engine demo   # requires build; prints state changes and a fake receipt
pnpm test                                  # all workspace tests
pnpm typecheck
```

The demo registers `NativeTransferStrategy`, runs the full lifecycle, and prints every
`stateChange` and `txEvent` along with the fake transaction hash and receipt.

## Tests

- `src/engine.test.ts` — state transitions, registry behavior, authorization rejection, receipt
  failure, timeout, and reset/cancel guards.
- `src/strategies/native-transfer.test.ts` — validation, encoding, simulation, execution, and
  confirmation, with an injected sleep function.
- `src/native-transfer.integration.test.ts` — engine plus native strategy integration.
- `src/native-transfer.e2e.test.ts` — full lifecycle with state and transaction event assertions.
