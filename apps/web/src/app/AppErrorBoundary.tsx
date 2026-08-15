import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  failed: boolean;
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  public override state: ErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught application error', error, info.componentStack);
  }

  public override render() {
    if (this.state.failed) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
          <section className="max-w-md border-l-4 border-red-700 bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-red-700">APPLICATION ERROR</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">
              This view could not be displayed.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Reload the page. If the problem continues, contact support.
            </p>
            <button
              className="button-primary mt-5"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
