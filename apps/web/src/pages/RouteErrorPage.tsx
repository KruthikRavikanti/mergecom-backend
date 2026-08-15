import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

export function RouteErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.statusText
    : error instanceof Error
      ? error.message
      : 'Unexpected route error';
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <section
        className="max-w-lg border-l-4 border-red-700 bg-white p-6 shadow-sm"
        role="alert"
      >
        <p className="text-sm font-bold text-red-700">ROUTE ERROR</p>
        <h1 className="mt-2 text-2xl font-bold">
          This page could not be loaded.
        </h1>
        <p className="mt-3 text-sm text-slate-600">{message}</p>
        <Link className="button-primary mt-5" to="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
