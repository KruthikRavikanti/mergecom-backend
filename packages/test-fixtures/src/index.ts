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
  corruptOffice: 'packages/test-fixtures/office/corrupt-office.docx',
  externalLinkExcel: 'packages/test-fixtures/office/external-link-excel.xlsx',
  macroWord: 'packages/test-fixtures/office/macro-word.docm',
  visualExcel: 'packages/test-fixtures/office/visual-excel.xlsx',
  visualPowerPoint: 'packages/test-fixtures/office/visual-powerpoint.pptx',
  visualWord: 'packages/test-fixtures/office/visual-word.docx',
  validWord: 'packages/test-fixtures/office/valid-word.docx',
} as const;
