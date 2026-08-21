import { useEffect, useRef, type RefObject } from 'react';
import { Link } from 'react-router-dom';

import { marketingNavigation } from '../content/site';

interface MobileMarketingNavProps {
  onClose: () => void;
  open: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function MobileMarketingNav({
  onClose,
  open,
  returnFocusRef,
}: MobileMarketingNavProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    focusable?.[0]?.focus();

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        returnFocusRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
    };
  }, [onClose, open, returnFocusRef]);

  if (!open) return null;

  return (
    <div className="marketing-mobile-nav-layer">
      <button
        aria-label="Close navigation"
        className="marketing-mobile-nav-backdrop"
        type="button"
        onClick={() => {
          onClose();
          returnFocusRef.current?.focus();
        }}
      />
      <div
        aria-label="Mobile primary navigation"
        className="marketing-mobile-nav"
        ref={panelRef}
        role="dialog"
      >
        <nav aria-label="Mobile primary">
          {marketingNavigation.map((item, index) => (
            <Link key={item.href} to={item.href} onClick={onClose}>
              <span>0{index + 1}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="marketing-mobile-nav-actions">
          <Link
            className="marketing-button is-primary"
            to="/request-access"
            onClick={onClose}
          >
            Request access
          </Link>
          <Link
            className="marketing-mobile-sign-in"
            to="/login"
            onClick={onClose}
          >
            Sign in to workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
