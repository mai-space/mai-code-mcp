import { describe, it, expect } from 'vitest';
import { chunkFile } from '../../src/indexer/chunker.js';

const TYPESCRIPT_CONTENT = `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}
`.trim();

const GENERIC_CONTENT = Array(100)
  .fill(null)
  .map((_, i) => `line ${i + 1}: some content here`)
  .join('\n');

describe('chunkFile', () => {
  it('chunks TypeScript content into symbol-based chunks', () => {
    const chunks = chunkFile(TYPESCRIPT_CONTENT, 'src/calc.ts', 'typescript', {
      projectName: 'test',
      chunkSize: 512,
      chunkOverlap: 64,
    });

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.id).toHaveLength(64);
      expect(chunk.projectName).toBe('test');
      expect(chunk.filePath).toBe('src/calc.ts');
      expect(chunk.language).toBe('typescript');
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.startLine).toBeGreaterThan(0);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
    }
  });

  it('chunks generic content using sliding window', () => {
    const chunks = chunkFile(GENERIC_CONTENT, 'notes.txt', 'unknown', {
      projectName: 'test',
      chunkSize: 512,
      chunkOverlap: 64,
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].language).toBe('unknown');
  });

  it('assigns unique IDs to each chunk', () => {
    const chunks = chunkFile(GENERIC_CONTENT, 'notes.txt', 'generic', {
      projectName: 'test',
    });

    const ids = new Set(chunks.map((c) => c.id));
    expect(ids.size).toBe(chunks.length);
  });

  it('calculates token count', () => {
    const chunks = chunkFile(TYPESCRIPT_CONTENT, 'src/calc.ts', 'typescript', {
      projectName: 'test',
    });

    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });
});
