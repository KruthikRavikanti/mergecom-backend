import { Menu, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { Brand } from '../../../components/layout/Brand';
import { marketingNavigation } from '../content/site';
import { useHeaderContrast } from '../hooks/useHeaderContrast';
import { AnnouncementBar } from './AnnouncementBar';
import { MobileMarketingNav } from './MobileMarketingNav';

export function MarketingHeader() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const scrolled = useHeaderContrast();
  const overlaysHero =
    location.pathname === '/' || location.pathname === '/product';
  const inverse = overlaysHero && !scrolled && !menuOpen;
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <AnnouncementBar />
      <header
        className={`marketing-header ${overlaysHero ? 'is-overlay' : ''} ${inverse ? 'is-inverse' : 'is-solid'}`}
      >
        <div className="marketing-header-inner">
          <Brand inverse={inverse} />
          <nav aria-label="Primary" className="marketing-desktop-nav">
            {marketingNavigation.map((item) => (
              <NavLink key={item.href} to={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="marketing-header-actions">
            <Link className="marketing-sign-in" to="/login">
              Sign in
            </Link>
            <Link className="marketing-button is-primary" to="/request-access">
              Request access
            </Link>
          </div>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            className="marketing-menu-button"
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>
      <MobileMarketingNav
        open={menuOpen}
        returnFocusRef={menuButtonRef}
        onClose={closeMenu}
      />
    </>
  );
}
