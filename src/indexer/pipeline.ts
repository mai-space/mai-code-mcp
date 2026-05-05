import { readFile } from 'fs/promises';
import type { EmbeddingProvider } from '../embeddings/provider.js';
import type { VectorStore } from '../store/store.js';
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
  store: VectorStore
): Promise<IndexResult> {
  const startTime = Date.now();
  const concurrency = options.concurrency ?? 4;

  logger.info({ projectName: options.projectName, rootPath: options.rootPath }, 'Starting indexing');

  const files = await walkDirectory(options.rootPath, options.additionalIgnore);
  logger.info({ fileCount: files.length }, 'Found files');

  await store.createCollection(options.projectName, provider.dimensions);

  let totalChunkCount = 0;

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

      logger.debug({ filePath: file.relativePath, chunkCount: chunks.length }, 'Indexed file');
    } catch (err) {
      logger.error({ filePath: file.relativePath, err }, 'Failed to index file');
    }
  });

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
  store: VectorStore
): Promise<IndexResult> {
  const startTime = Date.now();
  const concurrency = options.concurrency ?? 4;

  logger.info({ projectName: options.projectName }, 'Starting incremental reindex');

  const files = await walkDirectory(options.rootPath, options.additionalIgnore);
  const existingFiles = await store.listFiles(options.projectName);
  const existingSet = new Set(existingFiles.map((f) => f.filePath));

  for (const existing of existingFiles) {
    const stillExists = files.some((f) => f.relativePath === existing.filePath);
    if (!stillExists) {
      await store.deleteByFile(options.projectName, existing.filePath);
      logger.debug({ filePath: existing.filePath }, 'Deleted removed file chunks');
    }
  }

  let totalChunkCount = 0;

  await batchProcess(files, concurrency, async (file) => {
    try {
      const content = await readFile(file.path, 'utf8');
      const chunks = chunkFile(content, file.relativePath, file.language, {
        chunkSize: options.chunkSize,
        chunkOverlap: options.chunkOverlap,
        projectName: options.projectName,
      });

      if (chunks.length === 0) return;

      if (existingSet.has(file.relativePath)) {
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
    } catch (err) {
      logger.error({ filePath: file.relativePath, err }, 'Failed to reindex file');
    }
  });

  const duration = Date.now() - startTime;
  return { fileCount: files.length, chunkCount: totalChunkCount, duration };
}
