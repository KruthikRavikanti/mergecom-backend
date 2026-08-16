export const healthFixtures = {
  alive: { service: 'test-service', status: 'alive' as const },
  notReady: {
    dependencies: { database: 'unavailable' as const },
    service: 'test-service',
    status: 'not-ready' as const,
  },
  ready: {
    dependencies: { database: 'ready' as const },
    service: 'test-service',
    status: 'ready' as const,
  },
};

export const officeFixturePaths = {
  validWord: 'packages/test-fixtures/office/valid-word.docx',
} as const;
