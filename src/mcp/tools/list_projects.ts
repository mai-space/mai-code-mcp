import type { ProjectRecord } from '../../store/store.js';
import type { ProjectRegistry } from '../../store/project-registry.js';

export function getListProjectsTool() {
  return {
    name: 'list_projects',
    description: 'List all indexed projects with metadata',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  };
}

export async function handleListProjects(
  registry: ProjectRegistry
): Promise<{ projects: ProjectRecord[] }> {
  const projects = registry.list();
  return { projects };
}
