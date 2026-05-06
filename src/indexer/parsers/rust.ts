import type { Parser, ParseOptions } from './base.js';
import type { Chunk } from '../../store/store.js';
import { chunkId } from '../../utils/hash.js';
import { slidingWindowChunks } from './generic.js';

interface SymbolInfo {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  content: string;
}

function extractRustSymbols(lines: string[]): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const fnRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/;
  const structRegex = /^(?:pub\s+)?struct\s+(\w+)/;
  const enumRegex = /^(?:pub\s+)?enum\s+(\w+)/;
  const traitRegex = /^(?:pub\s+)?trait\s+(\w+)/;
  const implRegex = /^impl(?:<[^>]+>)?\s+(\w+)/;

  let depth = 0;
  let currentSymbol: { name: string; kind: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    let match: RegExpMatchArray | null;

    if (depth === 0) {
      if ((match = line.match(fnRegex))) {
        currentSymbol = { name: match[1], kind: 'function', startLine: i };
      } else if ((match = line.match(structRegex))) {
        currentSymbol = { name: match[1], kind: 'class', startLine: i };
      } else if ((match = line.match(enumRegex))) {
        currentSymbol = { name: match[1], kind: 'class', startLine: i };
      } else if ((match = line.match(traitRegex))) {
        currentSymbol = { name: match[1], kind: 'interface', startLine: i };
      } else if ((match = line.match(implRegex))) {
        currentSymbol = { name: match[1], kind: 'class', startLine: i };
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

export class RustParser implements Parser {
  readonly supportedLanguages = ['rust'];

  parse(content: string, options: ParseOptions): Chunk[] {
    const lines = content.split('\n');
    const symbols = extractRustSymbols(lines);

    if (symbols.length === 0) {
      return slidingWindowChunks(lines, options);
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
