import type { VectorStore, Chunk } from '../../store/store.js';

export interface GetChunkArgs {
  project: string;
  chunkId: string;
}

export interface GetChunksArgs {
  project: string;
  chunkIds: string[];
}

export function getGetChunkTool() {
  return {
    name: 'get_chunk',
    description:
      'Fetch the full source of a single code chunk by ID. ' +
      'Prefer get_chunks when you need multiple chunks — one call instead of many.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project name' },
        chunkId: { type: 'string', description: 'Chunk ID from a search_code result' },
      },
      required: ['project', 'chunkId'],
    },
  };
}

export function getGetChunksTool() {
  return {
    name: 'get_chunks',
    description:
      'Fetch full source for multiple code chunks in a single call. ' +
      'Use this instead of calling get_chunk repeatedly — saves round-trips and tokens.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project name' },
        chunkIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of chunk IDs from search_code results',
        },
      },
      required: ['project', 'chunkIds'],
    },
  };
}

export async function handleGetChunk(
  args: GetChunkArgs,
  store: VectorStore
): Promise<{ chunk: Chunk | null }> {
  const chunk = await store.getById(args.project, args.chunkId);
  return { chunk };
}

export async function handleGetChunks(
  args: GetChunksArgs,
  store: VectorStore
): Promise<{ chunks: Chunk[] }> {
  const chunks = await store.getByIds(args.project, args.chunkIds);
  return { chunks };
}
