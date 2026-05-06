import type { VectorStore } from './store.js';
import { QdrantStore } from './qdrant.js';
import { ChromaStore } from './chroma.js';

export interface StoreConfig {
  qdrant?: { url?: string; apiKey?: string };
  chroma?: { path?: string };
}

export function createVectorStore(storeSpec: string, config: StoreConfig = {}): VectorStore {
  const colonIdx = storeSpec.indexOf(':');
  const provider = colonIdx >= 0 ? storeSpec.slice(0, colonIdx) : storeSpec;
  const target = colonIdx >= 0 ? storeSpec.slice(colonIdx + 1) : undefined;

  switch (provider) {
    case 'qdrant':
      return new QdrantStore(target ?? config.qdrant?.url ?? 'http://localhost:6333', config.qdrant?.apiKey);
    case 'chroma':
      return new ChromaStore(target ?? config.chroma?.path ?? 'http://localhost:8000');
    default:
      throw new Error(`Unknown vector store provider: ${provider}`);
  }
}
