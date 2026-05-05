import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';

const ProjectConfigSchema = z.object({
  rootPath: z.string().optional(),
  model: z.string().optional(),
  store: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

const ConfigSchema = z.object({
  defaultModel: z.string().default('ollama:nomic-embed-text'),
  defaultStore: z.string().default('qdrant:http://localhost:6333'),
  chunkSize: z.number().default(512),
  chunkOverlap: z.number().default(64),
  concurrency: z.number().default(4),
  ignore: z.array(z.string()).default([]),
  projects: z.record(ProjectConfigSchema).default({}),
  ollama: z.object({ baseUrl: z.string().optional() }).optional(),
  openai: z.object({ apiKey: z.string().optional() }).optional(),
  cohere: z.object({ apiKey: z.string().optional() }).optional(),
  qdrant: z.object({ url: z.string().optional(), apiKey: z.string().optional() }).optional(),
  chroma: z.object({ path: z.string().optional() }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

function findConfigFile(): string | null {
  const candidates = [
    join(process.cwd(), '.mai-coderc'),
    join(process.cwd(), '.mai-coderc.json'),
    join(homedir(), '.mai-coderc'),
    join(homedir(), '.mai-coderc.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export function loadConfig(): Config {
  const configPath = findConfigFile();
  if (!configPath) {
    return ConfigSchema.parse({});
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    return ConfigSchema.parse(raw);
  } catch (err) {
    console.error(`Failed to load config from ${configPath}: ${err}`);
    return ConfigSchema.parse({});
  }
}
