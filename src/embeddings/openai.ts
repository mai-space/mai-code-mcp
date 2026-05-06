import OpenAI from 'openai';
import type { EmbeddingProvider } from './provider.js';

const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

export class OpenAIProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private client: OpenAI;

  constructor(model: string = 'text-embedding-3-small', apiKey?: string) {
    this.modelId = model;
    this.dimensions = MODEL_DIMENSIONS[model] ?? 1536;
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.modelId,
      input: texts,
    });

    return response.data.map((item) => item.embedding);
  }
}
