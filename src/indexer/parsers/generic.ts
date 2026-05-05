import type { Parser, ParseOptions } from './base.js';
import type { Chunk } from '../../store/store.js';
import { chunkId } from '../../utils/hash.js';

export class GenericParser implements Parser {
  readonly supportedLanguages: string[] = ['*'];

  parse(content: string, options: ParseOptions): Chunk[] {
    const lines = content.split('\n');
    const linesPerChunk = 40;
    const overlapLines = 5;

    const chunks: Chunk[] = [];
    let chunkIndex = 0;
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
          endLine: endLine,
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
}
