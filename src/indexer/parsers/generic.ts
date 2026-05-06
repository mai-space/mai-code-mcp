import type { Parser, ParseOptions } from './base.js';
import type { Chunk } from '../../store/store.js';
import { chunkId } from '../../utils/hash.js';

/**
 * Rough approximation: the average token count per source-code line.
 * Used to convert the token-budget knobs (chunkSize/chunkOverlap) into line counts.
 * At ~52 chars/line and ~4 chars/token this is 13 tokens/line.
 */
const TOKENS_PER_LINE = 13;

/**
 * Build a sliding-window chunk list from an array of lines, respecting the
 * chunkSize/chunkOverlap token budgets supplied via ParseOptions.
 */
export function slidingWindowChunks(
  lines: string[],
  options: ParseOptions,
  startIndex = 0
): Chunk[] {
  const linesPerChunk = Math.max(5, Math.round(options.chunkSize / TOKENS_PER_LINE));
  const overlapLines = Math.max(1, Math.round(options.chunkOverlap / TOKENS_PER_LINE));

  const chunks: Chunk[] = [];
  let chunkIndex = startIndex;
  let startLine = 0;

  while (startLine < lines.length) {
    const endLine = Math.min(startLine + linesPerChunk, lines.length);
    const chunkContent = lines.slice(startLine, endLine).join('\n');

    if (chunkContent.trim().length > 0) {
      chunks.push({
        id: chunkId(options.projectName, options.filePath, chunkIndex),
        projectName: options.projectName,
        filePath: options.filePath,
        language: options.language,
        startLine: startLine + 1,
        endLine,
        content: chunkContent,
        tokenCount: Math.ceil(chunkContent.length / 4),
      });
      chunkIndex++;
    }

    if (endLine >= lines.length) break;
    startLine = endLine - overlapLines;
    if (startLine < 0) startLine = 0;
  }

  return chunks;
}

export class GenericParser implements Parser {
  readonly supportedLanguages: string[] = ['*'];

  parse(content: string, options: ParseOptions): Chunk[] {
    const lines = content.split('\n');
    return slidingWindowChunks(lines, options);
  }
}
