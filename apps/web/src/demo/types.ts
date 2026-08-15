export interface DemoDocument {
  id: string;
  name: string;
  type: 'Presentation' | 'Spreadsheet' | 'Word document';
  updatedAt: string;
}

export interface DemoProject {
  client: string;
  id: string;
  imageUrl: string;
  name: string;
  owner: string;
  stage: 'Active review' | 'Drafting' | 'Final review';
  updatedAt: string;
  documents: DemoDocument[];
}

export interface DemoVersion {
  author: string;
  id: string;
  label: string;
  note: string;
  timestamp: string;
}
