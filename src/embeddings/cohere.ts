import axios from 'axios';
import type { EmbeddingProvider } from './provider.js';

const MODEL_DIMENSIONS: Record<string, number> = {
  'embed-english-v3.0': 1024,
  'embed-multilingual-v3.0': 1024,
  'embed-english-light-v3.0': 384,
};

export class CohereProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private apiKey: string;
  private readonly inputType: 'search_document' | 'search_query';

  constructor(
    model: string = 'embed-english-v3.0',
    apiKey?: string,
    inputType: 'search_document' | 'search_query' = 'search_document'
  ) {
    this.modelId = model;
    this.dimensions = MODEL_DIMENSIONS[model] ?? 1024;
    this.apiKey = apiKey ?? process.env.COHERE_API_KEY ?? '';
    this.inputType = inputType;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await axios.post(
      'https://api.cohere.ai/v1/embed',
      {
        model: this.modelId,
        texts,
        input_type: this.inputType,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.embeddings as number[][];
  }
}
