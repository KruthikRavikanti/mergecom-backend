import { Link } from 'react-router-dom';

interface BrandProps {
  compact?: boolean;
  inverse?: boolean;
}

export function Brand({ compact = false, inverse = false }: BrandProps) {
  return (
    <Link
      aria-label="MergeCom home"
      className="mergecom-brand inline-flex items-center gap-2"
      to="/"
    >
      <span
        aria-hidden="true"
        className={`mergecom-brand-mark ${inverse ? 'is-inverse' : ''}`}
      >
        <span>M</span>
      </span>
      {compact ? null : (
        <span
          className={`mergecom-brand-name ${inverse ? 'text-white' : 'text-slate-950'}`}
        >
          MergeCom
        </span>
      )}
    </Link>
  );
}
