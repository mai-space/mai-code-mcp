import { QdrantClient } from '@qdrant/js-client-rest';
import type { VectorStore, Chunk, Filter, SearchResult, FileEntry, CollectionStats, SymbolEntry } from './store.js';

export class QdrantStore implements VectorStore {
  private client: QdrantClient;

  constructor(url: string = 'http://localhost:6333', apiKey?: string) {
    this.client = new QdrantClient({ url, apiKey });
  }

  async createCollection(project: string, dimensions: number): Promise<void> {
    try {
      await this.client.getCollection(project);
    } catch {
      await this.client.createCollection(project, {
        vectors: { size: dimensions, distance: 'Cosine' },
      });
    }
  }

  async deleteCollection(project: string): Promise<void> {
    try {
      await this.client.deleteCollection(project);
    } catch {
      // Collection may not exist
    }
  }

  async listCollections(): Promise<string[]> {
    const response = await this.client.getCollections();
    return response.collections.map((c) => c.name);
  }

  async upsert(project: string, chunks: Chunk[], embeddings: number[][]): Promise<void> {
    const points = chunks.map((chunk, i) => ({
      id: this.hashToUUID(chunk.id),
      vector: embeddings[i],
      payload: {
        id: chunk.id,
        projectName: chunk.projectName,
        filePath: chunk.filePath,
        language: chunk.language,
        symbolName: chunk.symbolName,
        symbolKind: chunk.symbolKind,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
      },
    }));

    await this.client.upsert(project, { points });
  }

  async search(
    project: string,
    queryEmbedding: number[],
    topK: number,
    filter?: Filter
  ): Promise<SearchResult[]> {
    const qdrantFilter = filter ? this.buildFilter(filter) : undefined;

    const results = await this.client.search(project, {
      vector: queryEmbedding,
      limit: topK,
      filter: qdrantFilter,
      with_payload: true,
    });

    return results.map((r) => ({
      chunk: this.payloadToChunk(r.payload as Record<string, unknown>),
      score: r.score,
    }));
  }

  async getById(project: string, id: string): Promise<Chunk | null> {
    try {
      const results = await this.client.retrieve(project, {
        ids: [this.hashToUUID(id)],
        with_payload: true,
      });
      if (results.length === 0) return null;
      return this.payloadToChunk(results[0].payload as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  async getByIds(project: string, ids: string[]): Promise<Chunk[]> {
    if (ids.length === 0) return [];
    try {
      const results = await this.client.retrieve(project, {
        ids: ids.map((id) => this.hashToUUID(id)),
        with_payload: true,
      });
      return results.map((r) => this.payloadToChunk(r.payload as Record<string, unknown>));
    } catch {
      return [];
    }
  }

  async getFileOutline(project: string, filePath: string): Promise<SymbolEntry[]> {
    const points: Array<{ payload?: unknown }> = [];
    let offset: number | string | null | undefined = undefined;

    while (true) {
      const response = await this.client.scroll(project, {
        filter: { must: [{ key: 'filePath', match: { value: filePath } }] },
        limit: 1000,
        offset,
        with_payload: ['id', 'symbolName', 'symbolKind', 'filePath', 'startLine', 'endLine', 'tokenCount'],
      });

      points.push(...response.points);
      if (response.next_page_offset == null) break;
      offset = response.next_page_offset as number | string;
    }

    return points
      .map((p) => {
        const payload = p.payload as Record<string, unknown>;
        return {
          chunkId: payload.id as string,
          symbolName: (payload.symbolName as string) ?? '',
          symbolKind: (payload.symbolKind as string) ?? '',
          filePath: payload.filePath as string,
          startLine: payload.startLine as number,
          endLine: payload.endLine as number,
          tokenCount: payload.tokenCount as number,
        };
      })
      .sort((a, b) => a.startLine - b.startLine);
  }

  async listFiles(project: string): Promise<FileEntry[]> {
    const fileMap = new Map<string, { language: string; count: number }>();
    let offset: number | string | null | undefined = undefined;

    while (true) {
      const response = await this.client.scroll(project, {
        limit: 100,
        offset,
        with_payload: ['filePath', 'language'],
      });

      for (const point of response.points) {
        const payload = point.payload as Record<string, unknown>;
        const filePath = payload.filePath as string;
        const language = payload.language as string;
        const existing = fileMap.get(filePath);
        if (existing) {
          existing.count++;
        } else {
          fileMap.set(filePath, { language, count: 1 });
        }
      }

      if (response.next_page_offset == null) break;
      offset = response.next_page_offset as number;
    }

    return Array.from(fileMap.entries()).map(([filePath, { language, count }]) => ({
      filePath,
      language,
      chunkCount: count,
    }));
  }

  async stats(project: string): Promise<CollectionStats> {
    const info = await this.client.getCollection(project);
    const fileEntries = await this.listFiles(project);
    return {
      chunkCount: info.points_count ?? 0,
      fileCount: fileEntries.length,
      vectorCount: info.indexed_vectors_count ?? info.points_count ?? 0,
    };
  }

  async deleteByFile(project: string, filePath: string): Promise<void> {
    await this.client.delete(project, {
      filter: {
        must: [{ key: 'filePath', match: { value: filePath } }],
      },
    });
  }

  private hashToUUID(hash: string): string {
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  private buildFilter(filter: Filter): Record<string, unknown> {
    const must: Array<Record<string, unknown>> = [];
    if (filter.language) {
      must.push({ key: 'language', match: { value: filter.language } });
    }
    if (filter.symbolKind) {
      must.push({ key: 'symbolKind', match: { value: filter.symbolKind } });
    }
    if (filter.filePath) {
      must.push({ key: 'filePath', match: { value: filter.filePath } });
    }
    return { must };
  }

  private payloadToChunk(payload: Record<string, unknown>): Chunk {
    return {
      id: payload.id as string,
      projectName: payload.projectName as string,
      filePath: payload.filePath as string,
      language: payload.language as string,
      symbolName: payload.symbolName as string | undefined,
      symbolKind: payload.symbolKind as string | undefined,
      startLine: payload.startLine as number,
      endLine: payload.endLine as number,
      content: payload.content as string,
      tokenCount: payload.tokenCount as number,
    };
  }
}
