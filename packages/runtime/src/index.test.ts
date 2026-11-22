import { describe, expect, it } from 'vitest';
import { DEPENDENCIES, PACKAGE_DESCRIPTION, PACKAGE_NAME } from './index.js';

describe('@web3-forge/runtime', () => {
  it('exports its package identity', () => {
    expect(PACKAGE_NAME).toBe('@web3-forge/runtime');
    expect(PACKAGE_DESCRIPTION).toContain('WebChunk runtime');
    expect(DEPENDENCIES).toContain('@web3-forge/tx-engine');
  });
});
