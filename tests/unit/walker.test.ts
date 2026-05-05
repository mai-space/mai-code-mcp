import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { walkDirectory } from '../../src/indexer/walker.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.test-walker-dir');

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'node_modules'), { recursive: true });

  writeFileSync(join(TEST_DIR, 'src', 'index.ts'), 'export const x = 1;');
  writeFileSync(join(TEST_DIR, 'src', 'utils.py'), 'def hello(): pass');
  writeFileSync(join(TEST_DIR, 'README.md'), '# Test');
  writeFileSync(join(TEST_DIR, 'package-lock.json'), '{}');
  writeFileSync(join(TEST_DIR, 'node_modules', 'dep.ts'), 'export const y = 2;');
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('walkDirectory', () => {
  it('finds source files', async () => {
    const files = await walkDirectory(TEST_DIR);
    const paths = files.map((f) => f.relativePath);

    expect(paths).toContain(join('src', 'index.ts'));
    expect(paths).toContain(join('src', 'utils.py'));
  });

  it('skips node_modules', async () => {
    const files = await walkDirectory(TEST_DIR);
    const paths = files.map((f) => f.relativePath);

    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('skips lock files', async () => {
    const files = await walkDirectory(TEST_DIR);
    const paths = files.map((f) => f.relativePath);

    expect(paths.some((p) => p.includes('package-lock'))).toBe(false);
  });

  it('returns correct language for each file', async () => {
    const files = await walkDirectory(TEST_DIR);
    const tsFile = files.find((f) => f.relativePath.endsWith('index.ts'));
    const pyFile = files.find((f) => f.relativePath.endsWith('utils.py'));

    expect(tsFile?.language).toBe('typescript');
    expect(pyFile?.language).toBe('python');
  });

  it('includes content hash', async () => {
    const files = await walkDirectory(TEST_DIR);
    for (const file of files) {
      expect(file.contentHash).toHaveLength(64);
    }
  });
});
