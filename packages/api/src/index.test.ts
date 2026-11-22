import { describe, expect, it } from 'vitest';
import { DEPENDENCIES, PACKAGE_DESCRIPTION, PACKAGE_NAME, createApp } from './index.js';

describe('@web3-forge/api', () => {
  it('exports its package identity', () => {
    expect(PACKAGE_NAME).toBe('@web3-forge/api');
    expect(PACKAGE_DESCRIPTION).toContain('orchestration API');
    expect(DEPENDENCIES).toContain('@web3-forge/shared');
    expect(DEPENDENCIES).toContain('@web3-forge/tx-engine');
  });

  it('exports the Fastify app factory', () => {
    expect(createApp).toBeTypeOf('function');
  });
});
