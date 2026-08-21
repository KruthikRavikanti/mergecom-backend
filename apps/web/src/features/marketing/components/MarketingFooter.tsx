import { Link } from 'react-router-dom';

import { Brand } from '../../../components/layout/Brand';
import { footerGroups, marketingConfig } from '../content/site';
import { MarketingContainer } from './MarketingPrimitives';

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <MarketingContainer className="marketing-footer-grid">
        <div className="marketing-footer-brand">
          <Brand inverse />
          <p>
            Exact Office versions, visible changes, and review decisions in one
            controlled workspace.
          </p>
        </div>
        {footerGroups.map((group) => (
          <nav aria-label={group.label} key={group.label}>
            <h2>{group.label}</h2>
            {group.links.map((link) => (
              <Link key={link.href} to={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </MarketingContainer>
      <MarketingContainer className="marketing-footer-bottom">
        <p>{marketingConfig.productStatus}</p>
        <p suppressHydrationWarning>
          &copy; {new Date().getFullYear()} MergeCom
        </p>
      </MarketingContainer>
    </footer>
  );
}
