import { readFile } from 'fs/promises';
import type { EmbeddingProvider } from '../embeddings/provider.js';
import type { VectorStore } from '../store/store.js';
import type { ProjectRegistry } from '../store/project-registry.js';
import { walkDirectory } from './walker.js';
import { chunkFile } from './chunker.js';
import { batchProcess } from '../utils/concurrency.js';
import { logger } from '../utils/logger.js';

export interface IndexOptions {
  projectName: string;
  rootPath: string;
  chunkSize?: number;
  chunkOverlap?: number;
  concurrency?: number;
  additionalIgnore?: string[];
}

export interface IndexResult {
  fileCount: number;
  chunkCount: number;
  duration: number;
}

export async function indexProject(
  options: IndexOptions,
  provider: EmbeddingProvider,
  store: VectorStore,
  registry: ProjectRegistry
): Promise<IndexResult> {
  const startTime = Date.now();
  const concurrency = options.concurrency ?? 4;

  logger.info({ projectName: options.projectName, rootPath: options.rootPath }, 'Starting indexing');

  const files = await walkDirectory(options.rootPath, options.additionalIgnore);
  logger.info({ fileCount: files.length }, 'Found files');

  await store.createCollection(options.projectName, provider.dimensions);

  let totalChunkCount = 0;
  const newManifest = new Map<string, string>();

  await batchProcess(files, concurrency, async (file) => {
    try {
      const content = await readFile(file.path, 'utf8');
      const chunks = chunkFile(content, file.relativePath, file.language, {
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        projectName: options.projectName,
      });

      if (chunks.length === 0) return;

      const batchSize = 32;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.content);
        const embeddings = await provider.embed(texts);
        await store.upsert(options.projectName, batch, embeddings);
        totalChunkCount += batch.length;
      }

      newManifest.set(file.relativePath, file.contentHash);
      logger.debug({ filePath: file.relativePath, chunkCount: chunks.length }, 'Indexed file');
    } catch (err) {
      logger.error({ filePath: file.relativePath, err }, 'Failed to index file');
    }
  });

  registry.saveManifest(options.projectName, newManifest);

  const duration = Date.now() - startTime;
  logger.info({ fileCount: files.length, chunkCount: totalChunkCount, duration }, 'Indexing complete');

  return {
    fileCount: files.length,
    chunkCount: totalChunkCount,
    duration,
  };
}

export async function reindexProject(
  options: IndexOptions,
  provider: EmbeddingProvider,
  store: VectorStore,
  registry: ProjectRegistry
): Promise<IndexResult> {
  const startTime = Date.now();
  const concurrency = options.concurrency ?? 4;

  logger.info({ projectName: options.projectName }, 'Starting incremental reindex');

  const files = await walkDirectory(options.rootPath, options.additionalIgnore);

  // Ensure the collection exists (may have been deleted out-of-band)
  await store.createCollection(options.projectName, provider.dimensions);

  // Load stored manifest (filePath → contentHash) for diff detection
  const oldManifest = registry.getManifest(options.projectName);
  const newManifest = new Map<string, string>();

  // Build a Set of current relative paths for O(1) removed-file detection
  const currentPaths = new Set(files.map((f) => f.relativePath));

  // Delete chunks for files that have been removed from disk
  for (const filePath of oldManifest.keys()) {
    if (!currentPaths.has(filePath)) {
      await store.deleteByFile(options.projectName, filePath);
      logger.debug({ filePath }, 'Deleted removed file chunks');
    }
  }

  let totalChunkCount = 0;

  await batchProcess(files, concurrency, async (file) => {
    const prevHash = oldManifest.get(file.relativePath);

    // Skip unchanged files
    if (prevHash === file.contentHash) {
      newManifest.set(file.relativePath, file.contentHash);
      // Count existing chunks toward total (approximate via old manifest presence)
      return;
    }

    try {
      const content = await readFile(file.path, 'utf8');
      const chunks = chunkFile(content, file.relativePath, file.language, {
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        projectName: options.projectName,
      });

      if (chunks.length === 0) return;

      // Replace existing chunks for modified files
      if (prevHash !== undefined) {
        await store.deleteByFile(options.projectName, file.relativePath);
      }

      const batchSize = 32;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.content);
        const embeddings = await provider.embed(texts);
        await store.upsert(options.projectName, batch, embeddings);
        totalChunkCount += batch.length;
      }

      newManifest.set(file.relativePath, file.contentHash);
    } catch (err) {
      logger.error({ filePath: file.relativePath, err }, 'Failed to reindex file');
    }
  });

  registry.saveManifest(options.projectName, newManifest);

  const duration = Date.now() - startTime;
  logger.info({ fileCount: files.length, chunkCount: totalChunkCount, duration }, 'Reindex complete');

  return { fileCount: files.length, chunkCount: totalChunkCount, duration };
}

