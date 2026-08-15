interface ProfilePanelProps {
  displayName: string;
  email: string;
  emailVerified: boolean;
}

export function ProfilePanel({
  displayName,
  email,
  emailVerified,
}: ProfilePanelProps) {
  return (
    <section className="border-b border-slate-200 pb-7">
      <h2 className="text-lg font-bold text-slate-950">Profile</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="block text-sm font-semibold">
          Display name
          <p className="mt-1 border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">
            {displayName}
          </p>
        </div>
        <div className="block text-sm font-semibold">
          Verified email
          <p className="mt-1 border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-700">
            {email} {emailVerified ? '' : '(unverified)'}
          </p>
        </div>
      </div>
    </section>
  );
}
