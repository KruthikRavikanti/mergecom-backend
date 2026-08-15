import {
  ArrowRight,
  FileCheck2,
  GitCompareArrows,
  History,
  Shield,
  Users,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { readFormString, submitContactRequest } from '../services/contact';

const capabilities = [
  {
    icon: History,
    title: 'Version context',
    copy: 'Keep document revisions and review context organized around the work.',
  },
  {
    icon: GitCompareArrows,
    title: 'Review workflow',
    copy: 'Prepare structured comparison and review flows for Office documents.',
  },
  {
    icon: Users,
    title: 'Team workspace',
    copy: 'Give teams a consistent place to find projects, members, and activity.',
  },
];

export function HomePage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      await submitContactRequest({
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
    <main>
      <section className="relative flex min-h-[calc(100svh-7rem)] max-h-[760px] items-end overflow-hidden bg-slate-950">
        <img
          alt="Deal team reviewing documents together"
          className="absolute inset-0 h-full w-full object-cover opacity-55"
          src="/images/mergecom-team.jpg"
        />
        <div className="absolute inset-0 bg-slate-950/65" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-14 pt-24 text-white sm:px-6 sm:pb-20">
          <p className="text-sm font-bold text-red-300">
            DOCUMENT VERSION REVIEW
          </p>
          <h1 className="mt-3 text-5xl font-black leading-none sm:text-6xl">
            MergeCom
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-100 sm:text-xl">
            A focused workspace for teams building reliable review and version
            workflows around Microsoft Office documents.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="button-primary bg-red-600 hover:bg-red-700"
              to="/login"
            >
              Open workspace <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link
              className="button-secondary border-white/40 bg-white/10 text-white hover:bg-white/20"
              to="/security"
            >
              <Shield aria-hidden="true" size={17} />
              Security posture
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-0 px-4 py-14 sm:px-6 lg:grid-cols-3">
          {capabilities.map(({ copy, icon: Icon, title }) => (
            <article
              className="border-b border-slate-200 py-6 last:border-b-0 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0"
              key={title}
            >
              <Icon aria-hidden="true" className="text-red-700" size={24} />
              <h2 className="mt-4 text-lg font-bold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-100 py-16">
        <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_440px]">
          <div>
            <p className="text-sm font-bold text-red-700">CURRENT FOUNDATION</p>
            <h2 className="mt-2 max-w-xl text-3xl font-bold text-slate-950">
              Clear boundaries before document processing begins.
            </h2>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <div className="flex gap-3">
                <FileCheck2 className="shrink-0 text-red-700" size={21} />
                <p className="text-sm leading-6 text-slate-700">
                  Office prototypes are preserved outside production builds.
                </p>
              </div>
              <div className="flex gap-3">
                <Shield className="shrink-0 text-red-700" size={21} />
                <p className="text-sm leading-6 text-slate-700">
                  Security claims reflect implemented controls only.
                </p>
              </div>
            </div>
          </div>
          <form
            className="border-t-4 border-red-700 bg-white p-6 shadow-sm"
            onSubmit={(event) => void submit(event)}
          >
            <h2 className="text-xl font-bold text-slate-950">
              Contact the team
            </h2>
            <div className="mt-5 space-y-4">
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
                Message
                <textarea
                  className="field mt-1 min-h-24 resize-y"
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
              className="button-primary mt-5 w-full"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Submitting' : 'Submit request'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
