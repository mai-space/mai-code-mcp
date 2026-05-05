import type { VectorStore, Chunk } from '../../store/store.js';

export interface GetChunkArgs {
  project: string;
  chunkId: string;
}

export function getGetChunkTool() {
  return {
    name: 'get_chunk',
    description: 'Get a specific code chunk by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project name' },
        chunkId: { type: 'string', description: 'Chunk ID' },
      },
      required: ['project', 'chunkId'],
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
