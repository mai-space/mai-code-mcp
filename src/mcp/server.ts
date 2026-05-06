import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Config } from '../cli/config.js';
import { ProjectRegistry } from '../store/project-registry.js';
import { createEmbeddingProvider } from '../embeddings/factory.js';
import { createVectorStore } from '../store/factory.js';
import { getListProjectsTool, handleListProjects } from './tools/list_projects.js';
import {
  getSearchCodeTool,
  getSearchCodeMultiTool,
  handleSearchCode,
  handleSearchCodeMulti,
  type SearchCodeArgs,
  type SearchCodeMultiArgs,
} from './tools/search_code.js';
import { getGetChunkTool, handleGetChunk, type GetChunkArgs } from './tools/get_chunk.js';
import { getListFilesTool, handleListFiles, type ListFilesArgs } from './tools/list_files.js';
import { getProjectStats } from './resources/project_stats.js';
import { logger } from '../utils/logger.js';

export async function startServer(config: Config): Promise<void> {
  const registry = new ProjectRegistry();

  const server = new Server(
    { name: 'mai-code-mcp', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      getListProjectsTool(),
      getSearchCodeTool(),
      getSearchCodeMultiTool(),
      getGetChunkTool(),
      getListFilesTool(),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_projects': {
          const result = await handleListProjects(registry);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'search_code': {
          const searchArgs = args as unknown as SearchCodeArgs;
          const record = registry.get(searchArgs.project);
          if (!record) throw new Error(`Project '${searchArgs.project}' not found`);

          const provider = createEmbeddingProvider(record.model, {
            ollama: config.ollama,
            openai: config.openai,
            cohere: config.cohere,
          });
          const store = createVectorStore(record.store, {
            qdrant: config.qdrant,
            chroma: config.chroma,
          });

          const result = await handleSearchCode(searchArgs, provider, store);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'search_code_multi': {
          const multiArgs = args as unknown as SearchCodeMultiArgs;
          if (!multiArgs.projects || multiArgs.projects.length === 0) {
            throw new Error('No projects specified');
          }

          // Validate that all requested projects exist and share the same model + store
          const projectRecords = multiArgs.projects.map((name) => {
            const rec = registry.get(name);
            if (!rec) throw new Error(`Project '${name}' not found`);
            return rec;
          });

          const referenceModel = projectRecords[0].model;
          const referenceStore = projectRecords[0].store;
          for (const rec of projectRecords) {
            if (rec.model !== referenceModel) {
              throw new Error(
                `search_code_multi requires all projects to use the same embedding model. ` +
                  `Project '${rec.name}' uses '${rec.model}' but '${projectRecords[0].name}' uses '${referenceModel}'.`
              );
            }
            if (rec.store !== referenceStore) {
              throw new Error(
                `search_code_multi requires all projects to use the same vector store. ` +
                  `Project '${rec.name}' uses '${rec.store}' but '${projectRecords[0].name}' uses '${referenceStore}'.`
              );
            }
          }

          const provider = createEmbeddingProvider(referenceModel, {
            ollama: config.ollama,
            openai: config.openai,
            cohere: config.cohere,
          });
          const store = createVectorStore(referenceStore, {
            qdrant: config.qdrant,
            chroma: config.chroma,
          });

          const result = await handleSearchCodeMulti(multiArgs, provider, store);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'get_chunk': {
          const chunkArgs = args as unknown as GetChunkArgs;
          const record = registry.get(chunkArgs.project);
          if (!record) throw new Error(`Project '${chunkArgs.project}' not found`);

          const store = createVectorStore(record.store, {
            qdrant: config.qdrant,
            chroma: config.chroma,
          });

          const result = await handleGetChunk(chunkArgs, store);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'list_files': {
          const filesArgs = args as unknown as ListFilesArgs;
          const record = registry.get(filesArgs.project);
          if (!record) throw new Error(`Project '${filesArgs.project}' not found`);

          const store = createVectorStore(record.store, {
            qdrant: config.qdrant,
            chroma: config.chroma,
          });

          const result = await handleListFiles(filesArgs, store);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      logger.error({ tool: name, err }, 'Tool execution failed');
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'mai-code://projects',
        name: 'All Projects',
        description: 'List of all indexed projects',
        mimeType: 'application/json',
      },
      ...registry.list().map((p) => ({
        uri: `mai-code://projects/${p.name}/stats`,
        name: `${p.name} Stats`,
        description: `Statistics for project ${p.name}`,
        mimeType: 'application/json',
      })),
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'mai-code://projects') {
      const projects = registry.list();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ projects }, null, 2),
          },
        ],
      };
    }

    const statsMatch = uri.match(/^mai-code:\/\/projects\/(.+)\/stats$/);
    if (statsMatch) {
      const projectName = statsMatch[1];
      const stats = await getProjectStats(projectName, registry, config);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  logger.info('Starting MCP server (stdio transport)');
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
