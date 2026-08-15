import { LoadingState } from '@mergecom/ui';

export function LoadingPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50">
      <LoadingState label="Loading MergeCom" />
    </main>
  );
}
