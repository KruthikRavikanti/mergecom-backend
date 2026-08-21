import type { LucideIcon } from 'lucide-react';
import {
  ArchiveRestore,
  BetweenHorizontalStart,
  CheckCircle2,
  FileCheck2,
  FileChartColumn,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  History,
  LockKeyhole,
  MessageSquareText,
  ScanSearch,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

export type ClaimStatus = 'implemented' | 'controlled-preview' | 'future';

export interface MarketingClaim {
  detail: string;
  status: ClaimStatus;
  title: string;
}

export interface MarketingNavigationItem {
  href: string;
  label: string;
}

export interface IconContentItem extends MarketingClaim {
  icon: LucideIcon;
}

export const marketingConfig = {
  announcement: {
    enabled: true,
    href: '/product#formats',
    message: 'Visual version comparison for Word, Excel, and PowerPoint.',
  },
  contactEmail: import.meta.env.VITE_MARKETING_CONTACT_EMAIL?.trim() ?? '',
  previewLabel: 'Controlled preview',
  productStatus:
    'MergeCom is in controlled preview and is not approved for production use.',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL?.trim() ?? '',
} as const;

export const marketingNavigation: MarketingNavigationItem[] = [
  { href: '/product', label: 'Product' },
  { href: '/#workflow', label: 'How it works' },
  { href: '/security', label: 'Security' },
  { href: '/#use-cases', label: 'Use cases' },
];

export const heroContent = {
  description:
    'One place to save, compare, review, approve, and restore Microsoft Office files, without filename chaos.',
  headline: 'Version control for the documents that run your firm.',
  primaryAction: { href: '/request-access', label: 'Request access' },
  secondaryAction: { href: '/#product-showcase', label: 'See how it works' },
} as const;

export const formatProof: IconContentItem[] = [
  {
    detail: 'Pages, paragraphs, tables, sections, and inline wording changes.',
    icon: FileText,
    status: 'implemented',
    title: 'Word',
  },
  {
    detail: 'Sheets, cells, formulas, values, styles, and structural changes.',
    icon: FileSpreadsheet,
    status: 'implemented',
    title: 'Excel',
  },
  {
    detail: 'Slides, shapes, ordering, overlays, and notes context.',
    icon: FileChartColumn,
    status: 'implemented',
    title: 'PowerPoint',
  },
];

export const comparisonCallouts = [
  {
    detail: 'Move through substantive changes without scanning every page.',
    marker: '01',
    title: 'Change navigator',
  },
  {
    detail: 'Orient visually while semantic evidence remains authoritative.',
    marker: '02',
    title: 'Before and after',
  },
  {
    detail: 'Discuss and decide against the stable change record.',
    marker: '03',
    title: 'Evidence inspector',
  },
] as const;

export const benefits: IconContentItem[] = [
  {
    detail: 'Every saved version points to an immutable Office package.',
    icon: History,
    status: 'implemented',
    title: 'Exact versions, without filename chaos',
  },
  {
    detail:
      'Review Word, Excel, and PowerPoint changes with format-aware context.',
    icon: ScanSearch,
    status: 'implemented',
    title: 'Visual and structured comparison',
  },
  {
    detail:
      'Keep comments, decisions, and resolution anchored to stable comparison evidence.',
    icon: MessageSquareText,
    status: 'implemented',
    title: 'Discussion tied to the change',
  },
  {
    detail:
      'Separate the latest work from the version the team has actually approved.',
    icon: FileCheck2,
    status: 'implemented',
    title: 'A clear approved version',
  },
  {
    detail:
      'Bring an earlier artifact forward as a new version while preserving the full record.',
    icon: ArchiveRestore,
    status: 'implemented',
    title: 'Restore without rewriting history',
  },
];

export const workflowSteps: IconContentItem[] = [
  {
    detail:
      'Capture an exact version from Office or upload it through the workspace.',
    icon: BetweenHorizontalStart,
    status: 'implemented',
    title: 'Save',
  },
  {
    detail:
      'Choose a baseline and inspect semantic and visual changes together.',
    icon: GitCompareArrows,
    status: 'implemented',
    title: 'Compare',
  },
  {
    detail:
      'Assign reviewers, discuss exact changes, approve, or request changes.',
    icon: UsersRound,
    status: 'implemented',
    title: 'Review',
  },
  {
    detail:
      'Retrieve or restore the exact version without mutating prior history.',
    icon: ArchiveRestore,
    status: 'implemented',
    title: 'Restore',
  },
];

export const useCases = [
  {
    capability: 'Version history and presentation comparison',
    detail: 'Presentations, models, and iterative review cycles.',
    title: 'Investment banking and transaction teams',
  },
  {
    capability: 'Visual review and approved-version control',
    detail: 'Decks, analyses, and senior-review iterations.',
    title: 'Consulting teams',
  },
  {
    capability: 'Wording evidence, discussions, and approval history',
    detail: 'Wording, approvals, and retained evidence.',
    title: 'Legal and compliance teams',
  },
  {
    capability: 'Workbook comparison and recurring document history',
    detail: 'Workbooks, forecasts, and recurring reporting.',
    title: 'Finance and strategy teams',
  },
] as const;

export const productProof = [
  { detail: 'Microsoft Office formats supported', value: '3' },
  {
    detail: 'Visual, overlay, structured, and typed comparison modes',
    value: '4',
  },
  { detail: 'Clear approved-version pointer per document branch', value: '1' },
] as const;

// These statements map to docs/security and the implemented artifact pipeline.
export const securityClaims: IconContentItem[] = [
  {
    detail: 'Saved source files remain the authoritative artifacts.',
    icon: FileCheck2,
    status: 'implemented',
    title: 'Immutable original packages',
  },
  {
    detail:
      'Organization and project access is checked before resources return.',
    icon: UsersRound,
    status: 'implemented',
    title: 'Tenant-scoped authorization',
  },
  {
    detail: 'Artifact access uses private storage and short-lived grants.',
    icon: LockKeyhole,
    status: 'implemented',
    title: 'Private object storage',
  },
  {
    detail: 'Document parsing and rendition work runs outside the web process.',
    icon: ShieldCheck,
    status: 'implemented',
    title: 'Isolated processing',
  },
  {
    detail: 'Version and review mutations produce durable audit events.',
    icon: CheckCircle2,
    status: 'implemented',
    title: 'Audited mutations',
  },
  {
    detail: 'Retrieved artifacts can be checked against their stored hash.',
    icon: ScanSearch,
    status: 'implemented',
    title: 'Exact-hash verification',
  },
];

export const footerGroups = [
  {
    label: 'Product',
    links: [
      { href: '/product', label: 'Overview' },
      { href: '/#workflow', label: 'How it works' },
      { href: '/security', label: 'Security' },
    ],
  },
  {
    label: 'Resources',
    links: [
      { href: '/product#workflow', label: 'Quick start' },
      { href: '/support', label: 'Support' },
    ],
  },
  {
    label: 'Access',
    links: [
      { href: '/request-access', label: 'Request access' },
      { href: '/login', label: 'Sign in' },
    ],
  },
] as const;

export const prohibitedClaims = [
  'customer adoption numbers',
  'savings or productivity guarantees',
  'bank-grade security',
  'enterprise-ready status',
  'unearned certifications',
  'pixel-identical Microsoft Office previews',
  'replacement for Microsoft Office',
] as const;

export const approvedClaims = <T extends MarketingClaim>(claims: T[]): T[] =>
  claims.filter((claim) => claim.status !== 'future');
