import { describe, expect, it } from 'vitest';
import { DEPENDENCIES, PACKAGE_DESCRIPTION, PACKAGE_NAME } from './index.js';

describe('@web3-forge/web', () => {
  it('exports its package identity', () => {
    expect(PACKAGE_NAME).toBe('@web3-forge/web');
    expect(PACKAGE_DESCRIPTION).toContain('dashboard');
    expect(DEPENDENCIES).toContain('@web3-forge/runtime');
  });
});
