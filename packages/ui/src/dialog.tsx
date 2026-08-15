import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogProps {
  children: ReactNode;
  description?: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

export function Dialog({
  children,
  description,
  onClose,
  open,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-describedby={description ? 'mergecom-dialog-description' : undefined}
      aria-labelledby="mergecom-dialog-title"
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-md bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id="mergecom-dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description ? (
            <p
              id="mergecom-dialog-description"
              className="mt-1 text-sm text-slate-600"
            >
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close dialog"
          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
          onClick={onClose}
        >
          <X aria-hidden="true" size={19} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
