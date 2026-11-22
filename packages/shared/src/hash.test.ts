import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash.js';

describe('sha256Hex', () => {
  it('hashes strings and bytes with SHA-256', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(sha256Hex(new TextEncoder().encode('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('matches Node crypto for multi-block input', () => {
    const input = 'a'.repeat(1000);
    expect(sha256Hex(input)).toBe(createHash('sha256').update(input).digest('hex'));
  });
});
