import type { EmbeddingProvider } from '../../embeddings/provider.js';
import type { VectorStore, SearchResult, Filter } from '../../store/store.js';
import type { ProjectRecord } from '../../store/store.js';

export interface SearchCodeArgs {
  query: string;
  project?: string;
  topK?: number;
  minScore?: number;
  language?: string;
  symbolKind?: string;
  filePath?: string;
  includeContent?: boolean;
}

export interface SearchCodeMultiArgs {
  query: string;
  projects: string[];
  topK?: number;
  minScore?: number;
}

export interface SearchResultPreview {
  chunkId: string;
  project: string;
  filePath: string;
  language: string;
  symbolName?: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
  content?: string;
}

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SCORE = 0;
const MAX_PREVIEW_LINES = 20;
const MAX_PREVIEW_CHARS = 800;
const PREVIEW_ELLIPSIS = '…';

function createPreview(content: string): string {
  let newlineCount = 0;
  let endIndex = content.length;

  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') {
      newlineCount += 1;
      if (newlineCount === MAX_PREVIEW_LINES) {
        endIndex = i;
        break;
      }
    }
  }

  const lines = content.slice(0, endIndex).trimEnd();
  const wasLineTruncated = endIndex < content.length;
  if (lines.length <= MAX_PREVIEW_CHARS) {
    return wasLineTruncated ? `${lines}${PREVIEW_ELLIPSIS}` : lines;
  }

  return `${lines.slice(0, MAX_PREVIEW_CHARS - PREVIEW_ELLIPSIS.length).trimEnd()}${PREVIEW_ELLIPSIS}`;
}

function toPreview(result: SearchResult, project: string, includeContent: boolean): SearchResultPreview {
  const entry: SearchResultPreview = {
    chunkId: result.chunk.id,
    project,
    filePath: result.chunk.filePath,
    language: result.chunk.language,
    symbolName: result.chunk.symbolName,
    symbolKind: result.chunk.symbolKind,
    startLine: result.chunk.startLine,
    endLine: result.chunk.endLine,
    score: result.score,
    preview: createPreview(result.chunk.content),
  };
  if (includeContent) {
    entry.content = result.chunk.content;
  }
  return entry;
}

function applyMinScore(results: SearchResult[], minScore: number): SearchResult[] {
  if (minScore <= 0) return results;
  return results.filter((r) => r.score >= minScore);
}

export function getSearchCodeTool() {
  return {
    name: 'search_code',
    description:
      'Semantic search over indexed code. Returns ranked previews (first ~20 lines per result). ' +
      'SKIP list_projects — leave "project" unset to search all indexed projects at once. ' +
      'Use minScore≥0.5 to suppress noise and keep results relevant. ' +
      'Set includeContent=true (with topK≤3) to get full source inline and avoid a follow-up get_chunks call. ' +
      'Use filePath to restrict to one file. Prefer specific, symbol-level queries over broad grep-style terms.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Natural-language description of what to find' },
        project: {
          type: 'string',
          description:
            'Project name to search. OMIT to search all indexed projects automatically — ' +
            'no need to call list_projects first.',
        },
        topK: {
          type: 'number',
          description: `Max results to return (default: ${DEFAULT_TOP_K}). Keep ≤3 when using includeContent.`,
        },
        minScore: {
          type: 'number',
          description:
            'Minimum cosine similarity [0–1]. Results below this score are dropped. ' +
            'Recommended: 0.5 to filter irrelevant matches.',
        },
        language: { type: 'string', description: 'Filter by programming language' },
        symbolKind: {
          type: 'string',
          description: 'Filter by symbol kind: "function", "class", "interface"',
        },
        filePath: {
          type: 'string',
          description: 'Restrict search to this exact file path',
        },
        includeContent: {
          type: 'boolean',
          description:
            'Include full chunk source in each result. Eliminates a follow-up get_chunks call. ' +
            'Only combine with topK≤3 to avoid large responses.',
        },
      },
      required: ['query'],
    },
  };
}

export function getSearchCodeMultiTool() {
  return {
    name: 'search_code_multi',
    description:
      'Semantic search across specific projects simultaneously with per-project result sets. ' +
      'Use when you need results grouped by project. For a flat merged ranking across all projects, ' +
      'use search_code without a "project" argument instead.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Natural-language description of what to find' },
        projects: { type: 'array', items: { type: 'string' }, description: 'Project names to search' },
        topK: {
          type: 'number',
          description: `Max results per project (default: ${DEFAULT_TOP_K})`,
        },
        minScore: {
          type: 'number',
          description: 'Minimum cosine similarity score [0–1] applied to all projects',
        },
      },
      required: ['query', 'projects'],
    },
  };
}

/** Search a single project, returning flat previews with project name stamped. */
async function searchOneProject(
  projectName: string,
  args: SearchCodeArgs,
  store: VectorStore,
  embedding: number[]
): Promise<SearchResultPreview[]> {
  const filter: Filter = {};
  if (args.language) filter.language = args.language;
  if (args.symbolKind) filter.symbolKind = args.symbolKind;
  if (args.filePath) filter.filePath = args.filePath;

  const topK = args.topK ?? DEFAULT_TOP_K;
  const minScore = args.minScore ?? DEFAULT_MIN_SCORE;
  const includeContent = args.includeContent ?? false;

  const raw = await store.search(projectName, embedding, topK, filter);
  const filtered = applyMinScore(raw, minScore);
  return filtered.map((r) => toPreview(r, projectName, includeContent));
}

export async function handleSearchCode(
  args: SearchCodeArgs,
  provider: EmbeddingProvider,
  store: VectorStore,
  /** All known projects — required when args.project is omitted */
  allProjects?: ProjectRecord[]
): Promise<{ results: SearchResultPreview[] }> {
  const [embedding] = await provider.embed([args.query]);

  if (args.project) {
    const results = await searchOneProject(args.project, args, store, embedding);
    return { results };
  }

  // No project specified → search all available projects that share this store
  const projects = allProjects ?? [];
  const perProject = await Promise.all(
    projects.map((p) => searchOneProject(p.name, args, store, embedding))
  );

  // Merge and re-rank across projects by score (descending)
  const topK = args.topK ?? DEFAULT_TOP_K;
  const merged = perProject
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { results: merged };
}

export async function handleSearchCodeMulti(
  args: SearchCodeMultiArgs,
  provider: EmbeddingProvider,
  store: VectorStore
): Promise<{ byProject: Record<string, SearchResultPreview[]> }> {
  const [embedding] = await provider.embed([args.query]);
  const topK = args.topK ?? DEFAULT_TOP_K;
  const minScore = args.minScore ?? DEFAULT_MIN_SCORE;
  const byProject: Record<string, SearchResultPreview[]> = {};

  await Promise.all(
    args.projects.map(async (project) => {
      const raw = await store.search(project, embedding, topK);
      const filtered = applyMinScore(raw, minScore);
      byProject[project] = filtered.map((r) => toPreview(r, project, false));
    })
  );

  return { byProject };
}
