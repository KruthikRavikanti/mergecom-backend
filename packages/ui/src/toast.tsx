import { CheckCircle2, XCircle } from 'lucide-react';

export type ToastKind = 'error' | 'success';

export interface ToastProps {
  kind: ToastKind;
  message: string;
}

export function Toast({ kind, message }: ToastProps) {
  const Icon = kind === 'success' ? CheckCircle2 : XCircle;
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-lg"
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon
        aria-hidden="true"
        className={kind === 'success' ? 'text-emerald-600' : 'text-red-600'}
        size={19}
      />
      {message}
    </div>
  );
}
