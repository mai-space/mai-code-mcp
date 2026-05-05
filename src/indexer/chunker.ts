import type { Chunk } from '../store/store.js';
import type { Parser, ParseOptions } from './parsers/base.js';
import { GenericParser } from './parsers/generic.js';
import { TypeScriptParser } from './parsers/typescript.js';
import { PythonParser } from './parsers/python.js';
import { PhpParser } from './parsers/php.js';
import { RustParser } from './parsers/rust.js';

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  projectName: string;
}

const parsers: Parser[] = [
  new TypeScriptParser(),
  new PythonParser(),
  new PhpParser(),
  new RustParser(),
];

const genericParser = new GenericParser();

function getParser(language: string): Parser {
  for (const parser of parsers) {
    if (parser.supportedLanguages.includes(language)) {
      return parser;
    }
  }
  return genericParser;
}

export function chunkFile(
  content: string,
  filePath: string,
  language: string,
  options: ChunkOptions
): Chunk[] {
  const parser = getParser(language);
  const parseOptions: ParseOptions = {
    chunkSize: options.chunkSize ?? 512,
    chunkOverlap: options.chunkOverlap ?? 64,
    projectName: options.projectName,
    filePath,
    language,
  };
  return parser.parse(content, parseOptions);
}
