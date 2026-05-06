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

function extractSymbols(lines: string[]): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
  const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/;
  const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/;
  const arrowFuncRegex = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/;

  let depth = 0;
  let currentSymbol: { name: string; kind: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    let match: RegExpMatchArray | null;

    if (depth === 0) {
      if ((match = line.match(functionRegex))) {
        currentSymbol = { name: match[1], kind: 'function', startLine: i };
      } else if ((match = line.match(classRegex))) {
        currentSymbol = { name: match[1], kind: 'class', startLine: i };
      } else if ((match = line.match(interfaceRegex))) {
        currentSymbol = { name: match[1], kind: 'interface', startLine: i };
      } else if ((match = line.match(arrowFuncRegex))) {
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

export class TypeScriptParser implements Parser {
  readonly supportedLanguages = ['typescript', 'javascript'];

  parse(content: string, options: ParseOptions): Chunk[] {
    const lines = content.split('\n');
    const symbols = extractSymbols(lines);

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
