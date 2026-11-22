import {
  NATIVE_TRANSFER_STRATEGY,
  NativeTransferStrategy,
  TransactionEngine,
  TransactionState,
} from '../dist/index.js';

const engine = new TransactionEngine();
engine.registerStrategy(NATIVE_TRANSFER_STRATEGY, new NativeTransferStrategy());

engine.on('stateChange', (event) => {
  console.log(`[state] ${event.previous} -> ${event.state}`);
});
engine.on('txEvent', (event) => {
  console.log(`[txEvent] ${event.type}`, event.payload);
});

const params = {
  to: '0x000000000000000000000000000000000000dEaD',
  value: 1_000_000_000_000_000_000n,
};

const validation = await engine.validate(NATIVE_TRANSFER_STRATEGY, params);
if (!validation.ok) {
  throw new Error(`Validation failed: ${validation.errors?.join('; ')}`);
}

const encoded = await engine.encode(NATIVE_TRANSFER_STRATEGY, params);
const simulation = await engine.simulate(encoded, { chainId: 1 });
if (!simulation.ok) {
  throw new Error(`Simulation failed: ${simulation.revertReason}`);
}

const submission = await engine.execute(encoded, { approved: true }, { chainId: 1 });
if (!submission.ok || !submission.txHash) {
  throw new Error(`Submission failed: ${submission.error ?? 'missing txHash'}`);
}

const receipt = await engine.confirm(submission.txHash, 5_000);
console.log(`fake txHash: ${submission.txHash}`);
console.log('fake receipt:', receipt);

if (engine.state !== TransactionState.SUCCESS) {
  throw new Error(`Unexpected final state: ${engine.state}`);
}
