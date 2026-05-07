import { ChromaClient } from 'chromadb';
import type { Collection } from 'chromadb';
import type { VectorStore, Chunk, Filter, SearchResult, FileEntry, CollectionStats, SymbolEntry } from './store.js';

export class ChromaStore implements VectorStore {
  private client: ChromaClient;
  private collections: Map<string, Collection> = new Map();

  constructor(path: string = 'http://localhost:8000') {
    this.client = new ChromaClient({ path });
  }

  private async getCollection(project: string): Promise<Collection> {
    if (this.collections.has(project)) {
      return this.collections.get(project)!;
    }
    // embeddingFunction required by ChromaDB types but unused — we supply embeddings directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collection = await this.client.getCollection({ name: project } as any);
    this.collections.set(project, collection);
    return collection;
  }

  async createCollection(project: string, _dimensions: number): Promise<void> {
    try {
      const collection = await this.client.getOrCreateCollection({ name: project });
      this.collections.set(project, collection);
    } catch (err) {
      throw new Error(`Failed to create collection ${project}: ${err}`);
    }
  }

  async deleteCollection(project: string): Promise<void> {
    try {
      await this.client.deleteCollection({ name: project });
      this.collections.delete(project);
    } catch {
      // Collection may not exist
    }
  }

  async listCollections(): Promise<string[]> {
    const collections = await this.client.listCollections();
    // Handle both string[] (newer versions) and {name: string}[] (older versions)
    if (collections.length === 0) return [];
    if (typeof collections[0] === 'string') {
      return collections as unknown as string[];
    }
    return (collections as unknown as Array<{ name: string }>).map((c) => c.name);
  }

  async upsert(project: string, chunks: Chunk[], embeddings: number[][]): Promise<void> {
    const collection = await this.getCollection(project);
    await collection.upsert({
      ids: chunks.map((c) => c.id),
      embeddings,
      metadatas: chunks.map((c) => ({
        projectName: c.projectName,
        filePath: c.filePath,
        language: c.language,
        symbolName: c.symbolName ?? '',
        symbolKind: c.symbolKind ?? '',
        startLine: c.startLine,
        endLine: c.endLine,
        tokenCount: c.tokenCount,
      })),
      documents: chunks.map((c) => c.content),
    });
  }

  async search(
    project: string,
    queryEmbedding: number[],
    topK: number,
    filter?: Filter
  ): Promise<SearchResult[]> {
    const collection = await this.getCollection(project);
    const where = filter ? this.buildFilter(filter) : undefined;

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where,
    });

    const searchResults: SearchResult[] = [];
    const ids = results.ids[0];
    const distances = results.distances?.[0] ?? [];
    const metadatas = results.metadatas[0];
    const documents = results.documents[0];

    for (let i = 0; i < ids.length; i++) {
      const meta = metadatas[i] as Record<string, unknown>;
      searchResults.push({
        chunk: {
          id: ids[i],
          projectName: meta.projectName as string,
          filePath: meta.filePath as string,
          language: meta.language as string,
          symbolName: (meta.symbolName as string) || undefined,
          symbolKind: (meta.symbolKind as string) || undefined,
          startLine: meta.startLine as number,
          endLine: meta.endLine as number,
          content: documents[i] ?? '',
          tokenCount: meta.tokenCount as number,
        },
        score: 1 - (distances[i] ?? 0),
      });
    }

    return searchResults;
  }

  async getById(project: string, id: string): Promise<Chunk | null> {
    try {
      const collection = await this.getCollection(project);
      const results = await collection.get({ ids: [id] });
      if (results.ids.length === 0) return null;

      const meta = results.metadatas[0] as Record<string, unknown>;
      return {
        id: results.ids[0],
        projectName: meta.projectName as string,
        filePath: meta.filePath as string,
        language: meta.language as string,
        symbolName: (meta.symbolName as string) || undefined,
        symbolKind: (meta.symbolKind as string) || undefined,
        startLine: meta.startLine as number,
        endLine: meta.endLine as number,
        content: results.documents[0] ?? '',
        tokenCount: meta.tokenCount as number,
      };
    } catch {
      return null;
    }
  }

  async getByIds(project: string, ids: string[]): Promise<Chunk[]> {
    if (ids.length === 0) return [];
    try {
      const collection = await this.getCollection(project);
      const results = await collection.get({ ids });
      return results.ids.map((id, i) => {
        const meta = results.metadatas[i] as Record<string, unknown>;
        return {
          id,
          projectName: meta.projectName as string,
          filePath: meta.filePath as string,
          language: meta.language as string,
          symbolName: (meta.symbolName as string) || undefined,
          symbolKind: (meta.symbolKind as string) || undefined,
          startLine: meta.startLine as number,
          endLine: meta.endLine as number,
          content: results.documents[i] ?? '',
          tokenCount: meta.tokenCount as number,
        };
      });
    } catch {
      return [];
    }
  }

  async getFileOutline(project: string, filePath: string): Promise<SymbolEntry[]> {
    const collection = await this.getCollection(project);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await collection.get({
      where: { filePath: { $eq: filePath } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      include: ['metadatas'] as any,
    });
    return results.ids
      .map((id, i) => {
        const meta = results.metadatas[i] as Record<string, unknown>;
        return {
          chunkId: id,
          symbolName: (meta.symbolName as string) ?? '',
          symbolKind: (meta.symbolKind as string) ?? '',
          filePath: meta.filePath as string,
          startLine: meta.startLine as number,
          endLine: meta.endLine as number,
          tokenCount: meta.tokenCount as number,
        };
      })
      .sort((a, b) => a.startLine - b.startLine);
  }

  async listFiles(project: string): Promise<FileEntry[]> {
    const collection = await this.getCollection(project);
    const fileMap = new Map<string, { language: string; count: number }>();

    // Paginate to avoid loading the entire collection into memory at once.
    // MAX_PAGES is a safety cap against infinite loops if the collection changes
    // during iteration (e.g. concurrent writes) or if the termination condition
    // somehow never fires.
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 10_000; // up to 10 million chunks
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await collection.get({ include: ['metadatas'] as any, limit: PAGE_SIZE, offset });
      for (const meta of results.metadatas) {
        const m = meta as Record<string, unknown>;
        const filePath = m.filePath as string;
        const language = m.language as string;
        const existing = fileMap.get(filePath);
        if (existing) {
          existing.count++;
        } else {
          fileMap.set(filePath, { language, count: 1 });
        }
      }
      if (results.metadatas.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return Array.from(fileMap.entries()).map(([filePath, { language, count }]) => ({
      filePath,
      language,
      chunkCount: count,
    }));
  }

  async stats(project: string): Promise<CollectionStats> {
    const collection = await this.getCollection(project);
    const count = await collection.count();
    const files = await this.listFiles(project);
    return {
      chunkCount: count,
      fileCount: files.length,
      vectorCount: count,
    };
  }

  async deleteByFile(project: string, filePath: string): Promise<void> {
    const collection = await this.getCollection(project);
    await collection.delete({ where: { filePath: { $eq: filePath } } });
  }

  private buildFilter(filter: Filter): Record<string, unknown> {
    const conditions: Array<Record<string, unknown>> = [];
    if (filter.language) {
      conditions.push({ language: { $eq: filter.language } });
    }
    if (filter.symbolKind) {
      conditions.push({ symbolKind: { $eq: filter.symbolKind } });
    }
    if (filter.filePath) {
      conditions.push({ filePath: { $eq: filter.filePath } });
    }
    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }
}
