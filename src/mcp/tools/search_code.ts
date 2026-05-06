import type { EmbeddingProvider } from '../../embeddings/provider.js';
import type { VectorStore, SearchResult, Filter } from '../../store/store.js';

export interface SearchCodeArgs {
  query: string;
  project: string;
  topK?: number;
  language?: string;
  symbolKind?: string;
}

export interface SearchCodeMultiArgs {
  query: string;
  projects: string[];
  topK?: number;
}

export function getSearchCodeTool() {
  return {
    name: 'search_code',
    description: 'Search for code chunks by semantic similarity',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        project: { type: 'string', description: 'Project name' },
        topK: { type: 'number', description: 'Number of results (default: 10)' },
        language: { type: 'string', description: 'Filter by language' },
        symbolKind: { type: 'string', description: 'Filter by symbol kind' },
      },
      required: ['query', 'project'],
    },
  };
}

export function getSearchCodeMultiTool() {
  return {
    name: 'search_code_multi',
    description: 'Search across multiple projects',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        projects: { type: 'array', items: { type: 'string' }, description: 'Project names' },
        topK: { type: 'number', description: 'Number of results per project (default: 10)' },
      },
      required: ['query', 'projects'],
    },
  };
}

export async function handleSearchCode(
  args: SearchCodeArgs,
  provider: EmbeddingProvider,
  store: VectorStore
): Promise<{ results: SearchResult[] }> {
  const [embedding] = await provider.embed([args.query]);
  const filter: Filter = {};
  if (args.language) filter.language = args.language;
  if (args.symbolKind) filter.symbolKind = args.symbolKind;

  const results = await store.search(args.project, embedding, args.topK ?? 10, filter);
  return { results };
}

export async function handleSearchCodeMulti(
  args: SearchCodeMultiArgs,
  provider: EmbeddingProvider,
  store: VectorStore
): Promise<{ byProject: Record<string, SearchResult[]> }> {
  const [embedding] = await provider.embed([args.query]);
  const byProject: Record<string, SearchResult[]> = {};

  await Promise.all(
    args.projects.map(async (project) => {
      const results = await store.search(project, embedding, args.topK ?? 10);
      byProject[project] = results;
    })
  );

  return { byProject };
}
