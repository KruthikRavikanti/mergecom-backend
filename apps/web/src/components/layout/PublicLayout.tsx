import { Outlet } from 'react-router-dom';

import { MarketingHeader } from '../../features/marketing/components/MarketingHeader';
import { MarketingFooter } from '../../features/marketing/components/MarketingFooter';
import { MarketingMetadata } from '../../features/marketing/components/MarketingMetadata';
import '../../features/marketing/styles/marketing.css';

export function PublicLayout() {
  return (
    <div className="marketing-site min-h-screen bg-white">
      <MarketingMetadata />
      <a className="marketing-skip-link" href="#main-content">
        Skip to main content
      </a>
      <MarketingHeader />
      <div id="main-content">
        <Outlet />
      </div>
      <MarketingFooter />
    </div>
  );
}
