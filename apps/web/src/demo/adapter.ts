import { demoProjects, demoVersions } from './seed';
import type { DemoProject, DemoVersion } from './types';

const demoEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_DATA === 'true';

function assertDemoEnabled() {
  if (!demoEnabled)
    throw new Error(
      'The demo data adapter is disabled outside explicit development mode.',
    );
}

async function settle<T>(value: T): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  return structuredClone(value);
}

export const demoAdapter = {
  async getProject(projectId: string): Promise<DemoProject | null> {
    assertDemoEnabled();
    return settle(
      demoProjects.find((project) => project.id === projectId) ?? null,
    );
  },
  async getProjects() {
    assertDemoEnabled();
    return settle(demoProjects);
  },
  async getVersions(
    projectId: string,
    documentId: string,
  ): Promise<DemoVersion[]> {
    assertDemoEnabled();
    const project = demoProjects.find(
      (candidate) => candidate.id === projectId,
    );
    const documentExists =
      project?.documents.some((document) => document.id === documentId) ??
      false;
    return settle(documentExists ? demoVersions : []);
  },
};
