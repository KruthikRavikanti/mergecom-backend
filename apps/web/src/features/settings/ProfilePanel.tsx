interface ProfilePanelProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  title: string;
}

export function ProfilePanel({
  displayName,
  onDisplayNameChange,
  onTitleChange,
  title,
}: ProfilePanelProps) {
  return (
    <section className="border-b border-slate-200 pb-7">
      <h2 className="text-lg font-bold text-slate-950">Profile</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Display name
          <input
            className="field mt-1"
            required
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          Title
          <input
            className="field mt-1"
            required
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
