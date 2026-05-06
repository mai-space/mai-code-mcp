import type { Chunk } from '../../store/store.js';

export interface ParseOptions {
  chunkSize: number;
  chunkOverlap: number;
  projectName: string;
  filePath: string;
  language: string;
}

export interface Parser {
  parse(content: string, options: ParseOptions): Chunk[];
  readonly supportedLanguages: string[];
}
