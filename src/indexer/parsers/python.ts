import type { Parser, ParseOptions } from './base.js';
import type { Chunk } from '../../store/store.js';
import { chunkId } from '../../utils/hash.js';

interface SymbolInfo {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  content: string;
}

function extractPythonSymbols(lines: string[]): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(/;
  const classRegex = /^class\s+(\w+)/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let match: RegExpMatchArray | null;

    if ((match = line.match(classRegex))) {
      const startLine = i;
      const name = match[1];
      i++;
      while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
        i++;
      }
      symbols.push({
        name,
        kind: 'class',
        startLine,
        endLine: i - 1,
        content: lines.slice(startLine, i).join('\n'),
      });
    } else if ((match = line.match(funcRegex))) {
      const startLine = i;
      const name = match[1];
      i++;
      while (i < lines.length && (lines[i].startsWith('    ') || lines[i].startsWith('\t') || lines[i].trim() === '')) {
        i++;
      }
      symbols.push({
        name,
        kind: 'function',
        startLine,
        endLine: i - 1,
        content: lines.slice(startLine, i).join('\n'),
      });
    } else {
      i++;
    }
  }

  return symbols;
}

export class PythonParser implements Parser {
  readonly supportedLanguages = ['python'];

  parse(content: string, options: ParseOptions): Chunk[] {
    const lines = content.split('\n');
    const symbols = extractPythonSymbols(lines);

    if (symbols.length === 0) {
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
            endLine,
            content: chunkContent,
            tokenCount: Math.ceil(chunkContent.length / 4),
          });
          chunkIndex++;
        }

        if (endLine >= lines.length) break;
        startLine = endLine - overlapLines;
        if (startLine <= 0) startLine = endLine;
      }

      return chunks;
    }

    return symbols.map((sym, idx) => ({
      id: chunkId(options.projectName, options.filePath, idx),
      projectName: options.projectName,
      filePath: options.filePath,
      language: options.language,
      symbolName: sym.name,
      symbolKind: sym.kind,
      startLine: sym.startLine + 1,
      endLine: sym.endLine + 1,
      content: sym.content,
      tokenCount: Math.ceil(sym.content.length / 4),
    }));
  }
}
