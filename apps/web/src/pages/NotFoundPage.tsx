import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-slate-50 px-4">
      <section className="max-w-lg text-center">
        <p className="text-sm font-bold text-red-700">404</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">
          Page not found
        </h1>
        <p className="mt-3 text-slate-600">
          The address may be outdated, or you may not have access to this area.
        </p>
        <Link className="button-primary mt-6" to="/">
          <ArrowLeft aria-hidden="true" size={17} />
          Return home
        </Link>
      </section>
    </main>
  );
}
