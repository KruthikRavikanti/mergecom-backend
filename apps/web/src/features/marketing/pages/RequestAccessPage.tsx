import { ArrowRight, Check, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { trackMarketingEvent } from '../analytics/MarketingAnalytics';
import {
  MarketingContainer,
  SectionEyebrow,
} from '../components/MarketingPrimitives';
import { marketingConfig } from '../content/site';

const requestDetails = [
  'Your name and work email',
  'Your organization and role',
  'A short description of the document workflow',
];

export function RequestAccessPage() {
  const emailHref = marketingConfig.contactEmail
    ? `mailto:${marketingConfig.contactEmail}?subject=${encodeURIComponent('MergeCom controlled-preview access')}`
    : null;

  return (
    <main className="marketing-page request-access-page">
      <section className="marketing-page-hero">
        <MarketingContainer>
          <SectionEyebrow>Controlled preview</SectionEyebrow>
          <h1>Request access to MergeCom.</h1>
          <p>
            Preview access is reviewed directly so the workspace and document
            controls match the participating organization.
          </p>
        </MarketingContainer>
      </section>
      <section className="request-access-body">
        <MarketingContainer className="request-access-grid">
          <div>
            <h2>What to include</h2>
            <ul>
              {requestDetails.map((detail) => (
                <li key={detail}>
                  <Check aria-hidden="true" size={18} /> {detail}
                </li>
              ))}
            </ul>
            <p className="request-privacy-note">
              <ShieldCheck aria-hidden="true" size={20} />
              Do not include document content, client names, project metadata,
              or confidential information in an access request.
            </p>
          </div>
          <div className="request-access-channel">
            <Mail aria-hidden="true" size={28} />
            <h2>Access request channel</h2>
            {emailHref ? (
              <>
                <p>
                  Your email application will open. Nothing is transmitted by
                  this website or attached to your message automatically.
                </p>
                <a
                  className="marketing-button is-primary"
                  href={emailHref}
                  onClick={() =>
                    trackMarketingEvent({
                      name: 'request_access_form_started',
                    })
                  }
                >
                  Email the access team{' '}
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
              </>
            ) : (
              <>
                <p role="status">
                  Online request delivery is not connected. If a MergeCom
                  sponsor or administrator invited you, contact them through
                  your existing approved channel.
                </p>
                <p className="request-unavailable">
                  No information has been collected or submitted.
                </p>
              </>
            )}
            <Link to="/login">Already have access? Sign in</Link>
          </div>
        </MarketingContainer>
      </section>
    </main>
  );
}
