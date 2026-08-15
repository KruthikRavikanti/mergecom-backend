import { CheckCircle2, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  useAcceptInvitationMutation,
  useSwitchOrganizationMutation,
} from '../../api/queries';
import { useAuth } from '../../auth/AuthContext';

export function InviteAcceptancePage() {
  const { token } = useParams();
  const { user } = useAuth();
  const accept = useAcceptInvitationMutation(user!);
  const switchOrganization = useSwitchOrganizationMutation();
  const [accepted, setAccepted] = useState(false);

  if (!user || !token) return null;
  const submit = () => {
    accept.mutate(token, {
      onSuccess: ({ organizationId }) => {
        switchOrganization.mutate(
          {
            csrfToken: user.session.csrfToken,
            organizationId,
          },
          { onSuccess: () => setAccepted(true) },
        );
      },
    });
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <section className="w-full max-w-lg border-t-4 border-red-700 bg-white p-7 shadow-sm">
        {accepted ? (
          <>
            <CheckCircle2
              aria-hidden="true"
              className="text-emerald-700"
              size={30}
            />
            <h1 className="mt-4 text-2xl font-bold text-slate-950">
              Invitation accepted
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Your workspace and assigned permissions are now active.
            </p>
            <Link className="button-primary mt-6" to="/app">
              Open workspace
            </Link>
          </>
        ) : (
          <>
            <MailCheck aria-hidden="true" className="text-red-700" size={30} />
            <h1 className="mt-4 text-2xl font-bold text-slate-950">
              Accept workspace invitation
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This invitation will be matched to {user.user.email}. It can be
              accepted only once before it expires.
            </p>
            <button
              className="button-primary mt-6 w-full"
              disabled={accept.isPending || switchOrganization.isPending}
              type="button"
              onClick={submit}
            >
              {accept.isPending ? 'Verifying invitation' : 'Accept invitation'}
            </button>
            {accept.isError || switchOrganization.isError ? (
              <p className="mt-4 text-sm text-red-700" role="alert">
                This invitation is invalid, expired, already used, or assigned
                to another identity.
              </p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
