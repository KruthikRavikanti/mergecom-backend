import { LifeBuoy } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { readFormString, submitSupportRequest } from '../services/contact';

export function SupportPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      await submitSupportRequest({
        email: readFormString(form, 'email'),
        message: readFormString(form, 'message'),
        name: readFormString(form, 'name'),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Your request was not submitted.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="bg-slate-50 py-14">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_480px]">
        <section>
          <LifeBuoy aria-hidden="true" className="text-red-700" size={30} />
          <h1 className="mt-4 text-4xl font-bold text-slate-950">Support</h1>
          <p className="mt-4 max-w-xl leading-7 text-slate-600">
            Use this form to prepare a support request. Ticket delivery is not
            connected during Phase 1, and the form will clearly report that
            state.
          </p>
        </section>
        <form
          className="border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={(event) => void submit(event)}
        >
          <div className="space-y-4">
            <label className="block text-sm font-semibold">
              Name
              <input className="field mt-1" name="name" required />
            </label>
            <label className="block text-sm font-semibold">
              Work email
              <input
                className="field mt-1"
                name="email"
                required
                type="email"
              />
            </label>
            <label className="block text-sm font-semibold">
              How can we help?
              <textarea
                className="field mt-1 min-h-32 resize-y"
                name="message"
                required
              />
            </label>
          </div>
          {error ? (
            <p
              className="mt-4 border-l-4 border-red-700 bg-red-50 p-3 text-sm text-red-950"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <button
            className="button-primary mt-5"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Submitting' : 'Submit ticket'}
          </button>
        </form>
      </div>
    </main>
  );
}
