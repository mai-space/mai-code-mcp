import { Command } from 'commander';
import { loadConfig } from './config.js';
import { createEmbeddingProvider } from '../embeddings/factory.js';
import { createVectorStore } from '../store/factory.js';
import { ProjectRegistry } from '../store/project-registry.js';
import { indexProject, reindexProject } from '../indexer/pipeline.js';
import { startServer } from '../mcp/server.js';
import { logger } from '../utils/logger.js';

export function createCLI(): Command {
  const program = new Command();

  program
    .name('mai-code')
    .description('Index your code and expose it via MCP server')
    .version('0.1.0');

  program
    .command('index <path>')
    .description('Index a codebase')
    .requiredOption('--project <name>', 'Project name')
    .option('--model <provider:model>', 'Embedding model (e.g., ollama:nomic-embed-text)')
    .option('--store <store:target>', 'Vector store (e.g., qdrant:http://localhost:6333)')
    .option('--chunk-size <n>', 'Chunk size in tokens', parseInt)
    .option('--chunk-overlap <n>', 'Chunk overlap in tokens', parseInt)
    .option('--concurrency <n>', 'Concurrency level', parseInt)
    .option('--tag <key=value>', 'Tag (can be used multiple times)', (val: string, prev: string[]) => [...prev, val], [] as string[])
    .action(async (rootPath: string, opts: {
      project: string;
      model?: string;
      store?: string;
      chunkSize?: number;
      chunkOverlap?: number;
      concurrency?: number;
      tag: string[];
    }) => {
      const config = loadConfig();
      const modelSpec = opts.model ?? config.defaultModel;
      const storeSpec = opts.store ?? config.defaultStore;

      const tags: Record<string, string> = {};
      for (const tag of opts.tag) {
        const [k, v] = tag.split('=');
        if (k && v !== undefined) tags[k] = v;
      }

      const provider = createEmbeddingProvider(modelSpec, {
        ollama: config.ollama,
        openai: config.openai,
        cohere: config.cohere,
      });

      const store = createVectorStore(storeSpec, {
        qdrant: config.qdrant,
        chroma: config.chroma,
      });

      const registry = new ProjectRegistry();

      try {
        const result = await indexProject({
          projectName: opts.project,
          rootPath,
          chunkSize: opts.chunkSize ?? config.chunkSize,
          chunkOverlap: opts.chunkOverlap ?? config.chunkOverlap,
          concurrency: opts.concurrency ?? config.concurrency,
          additionalIgnore: config.ignore,
        }, provider, store, registry);

        registry.upsert({
          name: opts.project,
          rootPath,
          model: modelSpec,
          dimensions: provider.dimensions,
          store: storeSpec,
          chunkCount: result.chunkCount,
          fileCount: result.fileCount,
          tags,
          createdAt: new Date().toISOString(),
          lastIndexedAt: new Date().toISOString(),
        });

        console.log(`✓ Indexed ${result.fileCount} files, ${result.chunkCount} chunks in ${result.duration}ms`);
      } finally {
        registry.close();
      }
    });

  program
    .command('reindex <path>')
    .description('Incrementally reindex a codebase')
    .requiredOption('--project <name>', 'Project name')
    .option('--concurrency <n>', 'Concurrency level', parseInt)
    .action(async (rootPath: string, opts: { project: string; concurrency?: number }) => {
      const config = loadConfig();
      const registry = new ProjectRegistry();
      const record = registry.get(opts.project);

      if (!record) {
        console.error(`Project '${opts.project}' not found. Run 'mai-code index' first.`);
        process.exit(1);
      }

      const provider = createEmbeddingProvider(record.model, {
        ollama: config.ollama,
        openai: config.openai,
        cohere: config.cohere,
      });

      const store = createVectorStore(record.store, {
        qdrant: config.qdrant,
        chroma: config.chroma,
      });

      try {
        const result = await reindexProject({
          projectName: opts.project,
          rootPath,
          concurrency: opts.concurrency ?? config.concurrency,
          additionalIgnore: config.ignore,
        }, provider, store, registry);

        registry.upsert({
          ...record,
          chunkCount: result.chunkCount,
          fileCount: result.fileCount,
          lastIndexedAt: new Date().toISOString(),
        });

        console.log(`✓ Reindexed ${result.fileCount} files, ${result.chunkCount} chunks in ${result.duration}ms`);
      } finally {
        registry.close();
      }
    });

  program
    .command('serve')
    .description('Start the MCP server (communicates over stdio)')
    .action(async () => {
      const config = loadConfig();
      await startServer(config);
    });

  program
    .command('projects')
    .description('List all projects')
    .action(() => {
      const registry = new ProjectRegistry();
      try {
        const projects = registry.list();
        if (projects.length === 0) {
          console.log('No projects found.');
          return;
        }
        for (const p of projects) {
          console.log(`${p.name}`);
          console.log(`  Root: ${p.rootPath}`);
          console.log(`  Model: ${p.model}`);
          console.log(`  Store: ${p.store}`);
          console.log(`  Files: ${p.fileCount}, Chunks: ${p.chunkCount}`);
          console.log(`  Last indexed: ${p.lastIndexedAt}`);
          console.log();
        }
      } finally {
        registry.close();
      }
    });

  program
    .command('status')
    .description('Show project status')
    .requiredOption('--project <name>', 'Project name')
    .action((opts: { project: string }) => {
      const registry = new ProjectRegistry();
      try {
        const record = registry.get(opts.project);
        if (!record) {
          console.error(`Project '${opts.project}' not found.`);
          process.exit(1);
        }
        console.log(JSON.stringify(record, null, 2));
      } finally {
        registry.close();
      }
    });

  program
    .command('purge')
    .description('Purge a project or all projects')
    .option('--project <name>', 'Project name')
    .option('--all', 'Purge all projects')
    .action(async (opts: { project?: string; all?: boolean }) => {
      const config = loadConfig();
      const registry = new ProjectRegistry();

      try {
        if (opts.all) {
          const projects = registry.list();
          for (const p of projects) {
            const store = createVectorStore(p.store, {
              qdrant: config.qdrant,
              chroma: config.chroma,
            });
            await store.deleteCollection(p.name);
            logger.info({ project: p.name }, 'Purged project');
          }
          registry.deleteAll();
          console.log('✓ All projects purged');
        } else if (opts.project) {
          const record = registry.get(opts.project);
          if (!record) {
            console.error(`Project '${opts.project}' not found.`);
            process.exit(1);
          }
          const store = createVectorStore(record.store, {
            qdrant: config.qdrant,
            chroma: config.chroma,
          });
          await store.deleteCollection(opts.project);
          registry.delete(opts.project);
          console.log(`✓ Project '${opts.project}' purged`);
        } else {
          console.error('Specify --project <name> or --all');
          process.exit(1);
        }
      } finally {
        registry.close();
      }
    });

  return program;
}
