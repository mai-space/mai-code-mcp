import type { ProjectRegistry } from '../../store/project-registry.js';
import type { Config } from '../../cli/config.js';
import { createVectorStore } from '../../store/factory.js';

export async function getProjectStats(
  projectName: string,
  registry: ProjectRegistry,
  config: Config
): Promise<Record<string, unknown>> {
  const record = registry.get(projectName);
  if (!record) {
    throw new Error(`Project '${projectName}' not found`);
  }

  const store = createVectorStore(record.store, {
    qdrant: config.qdrant,
    chroma: config.chroma,
  });

  const stats = await store.stats(projectName);

  return {
    ...record,
    liveStats: stats,
  };
}
