export function NotificationPanel({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <section className="border-b border-slate-200 py-7">
      <h2 className="text-lg font-bold text-slate-950">Notifications</h2>
      <label className="mt-4 flex items-start gap-3">
        <input
          checked={enabled}
          className="mt-1 h-4 w-4 accent-red-700"
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-slate-900">
            Development activity digest
          </span>
          <span className="mt-1 block text-sm text-slate-600">
            Stores this preference in the in-memory demo adapter for the current
            session.
          </span>
        </span>
      </label>
    </section>
  );
}
