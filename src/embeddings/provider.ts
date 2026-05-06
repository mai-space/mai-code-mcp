export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly modelId: string;
  readonly dimensions: number;
}
