import { Link } from 'react-router-dom';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      aria-label="MergeCom home"
      className="inline-flex items-center gap-2"
      to="/"
    >
      <span
        className={`grid h-8 w-8 place-items-center border text-sm font-black ${inverse ? 'border-red-200 text-white' : 'border-red-800 text-red-800'}`}
      >
        M
      </span>
      <span
        className={`text-lg font-bold ${inverse ? 'text-white' : 'text-slate-950'}`}
      >
        MergeCom
      </span>
    </Link>
  );
}
