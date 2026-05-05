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

function extractPhpSymbols(lines: string[]): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const funcRegex = /^(?:(?:public|protected|private|static|abstract|final)\s+)*function\s+(\w+)/;
  const classRegex = /^(?:abstract\s+|final\s+)?class\s+(\w+)/;
  const interfaceRegex = /^interface\s+(\w+)/;
  const traitRegex = /^trait\s+(\w+)/;

  let depth = 0;
  let currentSymbol: { name: string; kind: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    let match: RegExpMatchArray | null;

    if (depth === 0) {
      if ((match = line.match(classRegex))) {
        currentSymbol = { name: match[1], kind: 'class', startLine: i };
      } else if ((match = line.match(interfaceRegex))) {
        currentSymbol = { name: match[1], kind: 'interface', startLine: i };
      } else if ((match = line.match(traitRegex))) {
        currentSymbol = { name: match[1], kind: 'trait', startLine: i };
      } else if ((match = line.match(funcRegex))) {
        currentSymbol = { name: match[1], kind: 'function', startLine: i };
      }
    }

    depth += openBraces - closeBraces;

    if (depth <= 0 && currentSymbol !== null) {
      depth = 0;
      symbols.push({
        name: currentSymbol.name,
        kind: currentSymbol.kind,
        startLine: currentSymbol.startLine,
        endLine: i,
        content: lines.slice(currentSymbol.startLine, i + 1).join('\n'),
      });
      currentSymbol = null;
    }
  }

  return symbols;
}

export class PhpParser implements Parser {
  readonly supportedLanguages = ['php'];

  parse(content: string, options: ParseOptions): Chunk[] {
    const lines = content.split('\n');
    const symbols = extractPhpSymbols(lines);

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
