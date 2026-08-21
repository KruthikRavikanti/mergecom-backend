import { useEffect, useState } from 'react';

export function useHeaderContrast(threshold = 72) {
  const [solid, setSolid] = useState(() =>
    typeof window === 'undefined' ? false : window.scrollY > threshold,
  );

  useEffect(() => {
    const update = () => setSolid(window.scrollY > threshold);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [threshold]);

  return solid;
}
