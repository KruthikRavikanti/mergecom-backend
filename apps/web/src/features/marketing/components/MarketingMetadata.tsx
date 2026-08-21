import { useEffect } from 'react';
import { useMatches } from 'react-router-dom';

import type {
  PublicPageMetadata,
  PublicRouteHandle,
} from '../content/metadata';
import { applyPublicPageMetadata } from './metadata-dom';

export function MarketingMetadata() {
  const matches = useMatches();
  const routeMetadata = matches
    .map(
      (match) => (match.handle as PublicRouteHandle | undefined)?.marketingMeta,
    )
    .filter((value): value is PublicPageMetadata => Boolean(value));
  const metadata = routeMetadata[routeMetadata.length - 1];

  useEffect(() => {
    if (metadata) applyPublicPageMetadata(metadata);
  }, [metadata]);

  return null;
}
