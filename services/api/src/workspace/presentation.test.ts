import { describe, expect, it } from 'vitest';

import {
  normalizeSearch,
  searchDestination,
  searchRank,
  workItemPresentation,
} from './presentation';

describe('workspace presentation', () => {
  it('ranks exact, prefix, and contained metadata matches', () => {
    expect(searchRank('Project Meridian', ' project meridian ')).toBe(0);
    expect(searchRank('Project Meridian', 'project')).toBe(1);
    expect(searchRank('Project Meridian', 'merid')).toBe(2);
    expect(searchRank('Project Meridian', 'atlas')).toBeNull();
    expect(normalizeSearch('  Operating   Model ')).toBe('operating model');
  });

  it('maps actionable work to current resource destinations', () => {
    expect(
      workItemPresentation({
        documentId: 'document',
        itemType: 'assigned_review',
        projectId: 'project',
        resourceId: 'review',
      }),
    ).toEqual({
      actionLabel: 'Review changes',
      destination:
        '/app/projects/project/documents/document/history/reviews/review',
      section: 'attention',
    });
  });

  it('builds metadata-only search destinations', () => {
    expect(
      searchDestination({
        documentId: null,
        id: 'folder',
        projectId: 'project',
        resourceType: 'folder',
      }),
    ).toBe('/app/projects/project/folders/folder');
  });
});
