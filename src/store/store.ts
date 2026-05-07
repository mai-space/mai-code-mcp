export interface ProjectRecord {
  name: string;
  rootPath: string;
  model: string;
  dimensions: number;
  store: string;
  chunkCount: number;
  fileCount: number;
  tags: Record<string, string>;
  createdAt: string;
  lastIndexedAt: string;
}

export interface Chunk {
  id: string;
  projectName: string;
  filePath: string;
  language: string;
  symbolName?: string;
  symbolKind?: string;
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
}

export interface Filter {
  language?: string;
  symbolKind?: string;
  filePath?: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export interface FileEntry {
  filePath: string;
  language: string;
  chunkCount: number;
}

export interface CollectionStats {
  chunkCount: number;
  fileCount: number;
  vectorCount: number;
}

export interface SymbolEntry {
  chunkId: string;
  symbolName: string;
  symbolKind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  tokenCount: number;
}

export interface VectorStore {
  createCollection(project: string, dimensions: number): Promise<void>;
  deleteCollection(project: string): Promise<void>;
  listCollections(): Promise<string[]>;
  upsert(project: string, chunks: Chunk[], embeddings: number[][]): Promise<void>;
  search(project: string, queryEmbedding: number[], topK: number, filter?: Filter): Promise<SearchResult[]>;
  getById(project: string, id: string): Promise<Chunk | null>;
  getByIds(project: string, ids: string[]): Promise<Chunk[]>;
  getFileOutline(project: string, filePath: string): Promise<SymbolEntry[]>;
  listFiles(project: string): Promise<FileEntry[]>;
  stats(project: string): Promise<CollectionStats>;
  deleteByFile(project: string, filePath: string): Promise<void>;
}
