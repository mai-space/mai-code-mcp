import type { EmbeddingProvider } from './provider.js';
import { OllamaProvider } from './ollama.js';
import { OpenAIProvider } from './openai.js';
import { CohereProvider } from './cohere.js';

export interface EmbeddingConfig {
  ollama?: { baseUrl?: string };
  openai?: { apiKey?: string };
  cohere?: { apiKey?: string };
}

export function createEmbeddingProvider(
  modelSpec: string,
  config: EmbeddingConfig = {}
): EmbeddingProvider {
  const colonIdx = modelSpec.indexOf(':');
  const provider = colonIdx >= 0 ? modelSpec.slice(0, colonIdx) : modelSpec;
  const model = colonIdx >= 0 ? modelSpec.slice(colonIdx + 1) : undefined;

  switch (provider) {
    case 'ollama':
      return new OllamaProvider(model ?? 'nomic-embed-text', config.ollama?.baseUrl);
    case 'openai':
      return new OpenAIProvider(model ?? 'text-embedding-3-small', config.openai?.apiKey);
    case 'cohere':
      return new CohereProvider(model ?? 'embed-english-v3.0', config.cohere?.apiKey);
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}
