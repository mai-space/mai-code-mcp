import { describe, it, expect } from 'vitest';
import { sha256, contentHash, chunkId } from '../../src/utils/hash.js';

describe('hash utilities', () => {
  it('sha256 returns a 64-character hex string', () => {
    const hash = sha256('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('sha256 is deterministic', () => {
    expect(sha256('test')).toBe(sha256('test'));
  });

  it('sha256 produces different hashes for different inputs', () => {
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('contentHash returns a hex string', () => {
    const hash = contentHash('const x = 1;');
    expect(hash).toHaveLength(64);
  });

  it('chunkId is deterministic', () => {
    const id = chunkId('myproject', 'src/index.ts', 0);
    expect(id).toBe(chunkId('myproject', 'src/index.ts', 0));
  });

  it('chunkId differs for different indices', () => {
    expect(chunkId('proj', 'file.ts', 0)).not.toBe(chunkId('proj', 'file.ts', 1));
  });
});
