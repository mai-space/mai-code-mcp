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

export interface SearchResultPreview {
  chunkId: string;
  filePath: string;
  language: string;
  symbolName?: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
}

const MAX_PREVIEW_LINES = 20;
const MAX_PREVIEW_CHARS = 800;

function createPreview(content: string): string {
  const lines = content.split('\n').slice(0, MAX_PREVIEW_LINES).join('\n').trimEnd();
  if (lines.length <= MAX_PREVIEW_CHARS) return lines;
  return `${lines.slice(0, MAX_PREVIEW_CHARS - 1).trimEnd()}…`;
}

function summarizeResult(result: SearchResult): SearchResultPreview {
  return {
    chunkId: result.chunk.id,
    filePath: result.chunk.filePath,
    language: result.chunk.language,
    symbolName: result.chunk.symbolName,
    symbolKind: result.chunk.symbolKind,
    startLine: result.chunk.startLine,
    endLine: result.chunk.endLine,
    score: result.score,
    preview: createPreview(result.chunk.content),
  };
}

export function getSearchCodeTool() {
  return {
    name: 'search_code',
    description: 'Search for code chunks by semantic similarity and return concise previews; use get_chunk for full content',
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
    description: 'Search across multiple projects and return concise previews; use get_chunk for full content',
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
): Promise<{ results: SearchResultPreview[] }> {
  const [embedding] = await provider.embed([args.query]);
  const filter: Filter = {};
  if (args.language) filter.language = args.language;
  if (args.symbolKind) filter.symbolKind = args.symbolKind;

  const results = await store.search(args.project, embedding, args.topK ?? 10, filter);
  return { results: results.map(summarizeResult) };
}

export async function handleSearchCodeMulti(
  args: SearchCodeMultiArgs,
  provider: EmbeddingProvider,
  store: VectorStore
): Promise<{ byProject: Record<string, SearchResultPreview[]> }> {
  const [embedding] = await provider.embed([args.query]);
  const byProject: Record<string, SearchResultPreview[]> = {};

  await Promise.all(
    args.projects.map(async (project) => {
      const results = await store.search(project, embedding, args.topK ?? 10);
      byProject[project] = results.map(summarizeResult);
    })
  );

  return { byProject };
}
