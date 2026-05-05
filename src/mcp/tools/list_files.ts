import type { VectorStore, FileEntry } from '../../store/store.js';

export interface ListFilesArgs {
  project: string;
  language?: string;
  glob?: string;
}

export function getListFilesTool() {
  return {
    name: 'list_files',
    description: 'List all files in a project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Project name' },
        language: { type: 'string', description: 'Filter by language' },
        glob: { type: 'string', description: 'Glob pattern to filter file paths' },
      },
      required: ['project'],
    },
  };
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export async function handleListFiles(
  args: ListFilesArgs,
  store: VectorStore
): Promise<{ files: FileEntry[] }> {
  let files = await store.listFiles(args.project);

  if (args.language) {
    files = files.filter((f) => f.language === args.language);
  }

  if (args.glob) {
    const regex = globToRegex(args.glob);
    files = files.filter((f) => regex.test(f.filePath));
  }

  return { files };
}
