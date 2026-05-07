import type { VectorStore, SymbolEntry } from '../../store/store.js';

export interface GetFileOutlineArgs {
  project: string;
  filePath: string;
}

export function getGetFileOutlineTool() {
  return {
    name: 'get_file_outline',
    description:
      'List all indexed symbols (functions, classes, interfaces) in a file with their line ranges and ' +
      'chunk IDs — without returning source code. Use this to understand a file\'s structure before ' +
      'deciding which chunks to read via get_chunks. Much cheaper than fetching full content.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project name' },
        filePath: {
          type: 'string',
          description: 'File path relative to project root (e.g. "src/auth/login.ts")',
        },
      },
      required: ['project', 'filePath'],
    },
  };
}

export async function handleGetFileOutline(
  args: GetFileOutlineArgs,
  store: VectorStore
): Promise<{ filePath: string; symbols: SymbolEntry[] }> {
  const symbols = await store.getFileOutline(args.project, args.filePath);
  return { filePath: args.filePath, symbols };
}
