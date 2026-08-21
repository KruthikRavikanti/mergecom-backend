export interface PublicPageMetadata {
  description: string;
  image?: string;
  noIndex?: boolean;
  path: string;
  title: string;
}

export interface PublicRouteHandle {
  marketingMeta?: PublicPageMetadata;
}

export const publicPageMetadata = {
  home: {
    description:
      'Save, compare, review, approve, and restore Word, Excel, and PowerPoint versions in one controlled workspace.',
    image: '/marketing/mergecom-social-card.webp',
    path: '/',
    title: 'MergeCom | Version control for Microsoft Office documents',
  },
  login: {
    description: 'Sign in to your MergeCom workspace.',
    noIndex: true,
    path: '/login',
    title: 'Sign in | MergeCom',
  },
  notFound: {
    description: 'The requested MergeCom page could not be found.',
    noIndex: true,
    path: '/404',
    title: 'Page not found | MergeCom',
  },
  product: {
    description:
      'See how MergeCom saves exact Office packages and connects comparison, review, approval, and restore workflows.',
    image: '/marketing/mergecom-social-card.webp',
    path: '/product',
    title: 'Product | MergeCom',
  },
  requestAccess: {
    description:
      'Request controlled-preview access to the MergeCom document version workspace.',
    path: '/request-access',
    title: 'Request access | MergeCom',
  },
  security: {
    description:
      'Review the technical controls implemented in the current MergeCom controlled preview.',
    path: '/security',
    title: 'Security | MergeCom',
  },
  signup: {
    description: 'Learn how controlled-preview MergeCom access works.',
    noIndex: true,
    path: '/signup',
    title: 'Workspace access | MergeCom',
  },
  support: {
    description:
      'Find current support options and operating guidance for MergeCom.',
    path: '/support',
    title: 'Support | MergeCom',
  },
} satisfies Record<string, PublicPageMetadata>;
