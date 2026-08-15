import type {
  DemoMember,
  DemoProject,
  DemoSettings,
  DemoVersion,
} from './types';

export const demoProjects: DemoProject[] = [
  {
    client: 'Northstar Holdings',
    documents: [
      {
        id: 'doc-cim',
        name: 'Confidential Information Memorandum.pptx',
        type: 'Presentation',
        updatedAt: '2026-08-14T15:20:00Z',
      },
      {
        id: 'doc-model',
        name: 'Operating Model.xlsx',
        type: 'Spreadsheet',
        updatedAt: '2026-08-13T18:45:00Z',
      },
    ],
    id: 'proj-meridian',
    imageUrl: '/images/project-review.jpg',
    name: 'Project Meridian',
    owner: 'Avery Chen',
    stage: 'Active review',
    updatedAt: '2026-08-14T15:20:00Z',
  },
  {
    client: 'Cedar Ridge Software',
    documents: [
      {
        id: 'doc-brief',
        name: 'Investment Committee Brief.docx',
        type: 'Word document',
        updatedAt: '2026-08-12T13:10:00Z',
      },
    ],
    id: 'proj-atlas',
    imageUrl: '/images/project-review.jpg',
    name: 'Project Atlas',
    owner: 'Jordan Lee',
    stage: 'Drafting',
    updatedAt: '2026-08-12T13:10:00Z',
  },
  {
    client: 'Beacon Industrial',
    documents: [
      {
        id: 'doc-board',
        name: 'Board Review Deck.pptx',
        type: 'Presentation',
        updatedAt: '2026-08-10T09:30:00Z',
      },
    ],
    id: 'proj-harbor',
    imageUrl: '/images/project-review.jpg',
    name: 'Project Harbor',
    owner: 'Morgan Patel',
    stage: 'Final review',
    updatedAt: '2026-08-10T09:30:00Z',
  },
];

export const demoVersions: DemoVersion[] = [
  {
    author: 'Avery Chen',
    id: 'version-3',
    label: 'Review draft 3',
    note: 'Updated market overview and management commentary.',
    timestamp: '2026-08-14T15:20:00Z',
  },
  {
    author: 'Jordan Lee',
    id: 'version-2',
    label: 'Review draft 2',
    note: 'Incorporated operating model feedback.',
    timestamp: '2026-08-13T18:45:00Z',
  },
  {
    author: 'Morgan Patel',
    id: 'version-1',
    label: 'Initial review draft',
    note: 'Prepared the first structured review package.',
    timestamp: '2026-08-12T11:05:00Z',
  },
];

export const demoMembers: DemoMember[] = [
  {
    email: 'avery@example.test',
    id: 'member-1',
    name: 'Avery Chen',
    role: 'Project lead',
  },
  {
    email: 'jordan@example.test',
    id: 'member-2',
    name: 'Jordan Lee',
    role: 'Reviewer',
  },
  {
    email: 'morgan@example.test',
    id: 'member-3',
    name: 'Morgan Patel',
    role: 'Reviewer',
  },
];

export const initialDemoSettings: DemoSettings = {
  digestEnabled: true,
  displayName: 'Demo Reviewer',
  title: 'Document reviewer',
};
