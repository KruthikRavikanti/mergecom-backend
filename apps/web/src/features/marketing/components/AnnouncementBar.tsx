import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { marketingConfig } from '../content/site';

export function AnnouncementBar() {
  if (!marketingConfig.announcement.enabled) return null;

  return (
    <div className="marketing-announcement">
      <Link to={marketingConfig.announcement.href}>
        <span>{marketingConfig.announcement.message}</span>
        <span className="marketing-announcement-link">
          Explore the product <ArrowUpRight aria-hidden="true" size={14} />
        </span>
      </Link>
    </div>
  );
}
