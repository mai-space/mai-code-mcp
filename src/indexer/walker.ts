import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import { existsSync, readFileSync } from 'fs';
import ignoreFactory from 'ignore';
import type { Ignore } from 'ignore';
import { contentHash } from '../utils/hash.js';

/** Sentinel language returned for text files with unrecognised extensions. */
export const UNKNOWN_LANGUAGE = 'unknown';

export interface FileEntry {
  path: string;
  relativePath: string;
  language: string;
  sizeBytes: number;
  lastModified: Date;
  contentHash: string;
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  php: 'php',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'c',
  cc: 'c',
  h: 'c',
  hpp: 'c',
  rb: 'ruby',
  cs: 'csharp',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'shell',
  bash: 'shell',
};

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'vendor',
  'dist',
  'build',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'target',
]);

const SKIP_FILE_PATTERNS = [
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.js$/,
  /\.min\.css$/,
  /\.map$/,
];

function getLanguage(filePath: string): string | null {
  const ext = extname(filePath).slice(1).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || null;
}

function shouldSkipFile(fileName: string): boolean {
  return SKIP_FILE_PATTERNS.some((p) => p.test(fileName));
}

export async function walkDirectory(
  rootPath: string,
  additionalIgnore: string[] = []
): Promise<FileEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ig: Ignore = (ignoreFactory as unknown as (opts?: unknown) => Ignore)();

  const gitignorePath = join(rootPath, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf8');
    ig.add(gitignoreContent);
  }

  const maiCodeIgnorePath = join(rootPath, '.mai-codeignore');
  if (existsSync(maiCodeIgnorePath)) {
    const maiCodeIgnoreContent = readFileSync(maiCodeIgnorePath, 'utf8');
    ig.add(maiCodeIgnoreContent);
  }

  ig.add(['node_modules/', '.git/', 'dist/', 'build/', '__pycache__/', 'vendor/']);
  ig.add(additionalIgnore);

  const entries: FileEntry[] = [];

  async function walk(dirPath: string): Promise<void> {
    let items: string[];
    try {
      items = await readdir(dirPath);
    } catch {
      return;
    }

    for (const item of items) {
      const fullPath = join(dirPath, item);
      // Normalise to forward slashes so `ignore` patterns match on Windows too
      const relPath = relative(rootPath, fullPath).replace(/\\/g, '/');

      if (ig.ignores(relPath)) continue;

      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }

      if (fileStat.isDirectory()) {
        if (SKIP_DIRS.has(item)) continue;
        await walk(fullPath);
      } else if (fileStat.isFile()) {
        if (shouldSkipFile(item)) continue;

        if (fileStat.size > 1024 * 1024) continue;

        // Read as raw buffer first to detect binary content (null bytes)
        let buffer: Buffer;
        try {
          buffer = await readFile(fullPath);
        } catch {
          continue;
        }
        const sampleSize = Math.min(buffer.length, 8192);
        if (buffer.subarray(0, sampleSize).includes(0)) continue; // binary file

        const fileContent = buffer.toString('utf8');
        const language = getLanguage(item) ?? UNKNOWN_LANGUAGE;

        entries.push({
          path: fullPath,
          relativePath: relPath,
          language,
          sizeBytes: fileStat.size,
          lastModified: fileStat.mtime,
          contentHash: contentHash(fileContent),
        });
      }
    }
  }

  await walk(rootPath);
  return entries;
}
