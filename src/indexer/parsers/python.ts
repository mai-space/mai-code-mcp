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

function getIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else if (ch === '\t') count += 4;
    else break;
  }
  return count;
}

function extractPythonSymbols(lines: string[]): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const funcRegex = /^(?:async\s+)?def\s+(\w+)\s*\(/;
  const classRegex = /^class\s+(\w+)/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let match: RegExpMatchArray | null;

    if ((match = line.match(classRegex)) || (match = line.match(funcRegex))) {
      const kind = line.match(classRegex) ? 'class' : 'function';
      const name = match[1];
      const startLine = i;
      const baseIndent = getIndent(line);
      i++;

      // Collect body lines: indented more than baseIndent, plus blank lines between them
      let lastBodyLine = i - 1;
      while (i < lines.length) {
        const current = lines[i];
        if (current.trim() === '') {
          // blank line - peek ahead to see if next non-blank line is still indented
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && getIndent(lines[j]) > baseIndent) {
            i = j; // skip blanks and continue
            lastBodyLine = i;
            i++;
          } else {
            break; // blank line followed by same/lower indent = end of symbol
          }
        } else if (getIndent(current) > baseIndent) {
          lastBodyLine = i;
          i++;
        } else {
          break;
        }
      }

      symbols.push({
        name,
        kind,
        startLine,
        endLine: lastBodyLine,
        content: lines.slice(startLine, lastBodyLine + 1).join('\n'),
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
        if (startLine < 0) startLine = 0;
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
