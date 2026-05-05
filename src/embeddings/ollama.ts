import axios from 'axios';
import type { EmbeddingProvider } from './provider.js';

const MODEL_DIMENSIONS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
};

export class OllamaProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private baseUrl: string;

  constructor(model: string = 'nomic-embed-text', baseUrl: string = 'http://localhost:11434') {
    this.modelId = model;
    this.dimensions = MODEL_DIMENSIONS[model] ?? 768;
    this.baseUrl = baseUrl;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await axios.post(`${this.baseUrl}/api/embed`, {
      model: this.modelId,
      input: texts,
    });

    if (response.data.embeddings) {
      return response.data.embeddings as number[][];
    }

    throw new Error('Unexpected response from Ollama embed API');
  }
}
