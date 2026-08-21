import { CheckCircle2, CircleDashed, ShieldCheck } from 'lucide-react';

import {
  MarketingContainer,
  SectionEyebrow,
} from '../components/MarketingPrimitives';
import {
  approvedClaims,
  marketingConfig,
  securityClaims,
} from '../content/site';

const limitations = [
  'No independent compliance certification is currently claimed.',
  'Controlled preview is not approved for production use.',
  'Generated previews support orientation and may differ from Microsoft Office rendering.',
  'Operational evidence must be reviewed before any real pilot is approved.',
];

export function MarketingSecurityPage() {
  return (
    <main className="marketing-page security-page">
      <section className="marketing-page-hero is-security">
        <MarketingContainer>
          <ShieldCheck aria-hidden="true" size={32} />
          <SectionEyebrow>Security</SectionEyebrow>
          <h1>Implemented controls, stated precisely.</h1>
          <p>
            MergeCom protects exact source artifacts and applies organization,
            project, and role boundaries throughout the document workflow.
          </p>
        </MarketingContainer>
      </section>
      <section className="security-page-body">
        <MarketingContainer>
          <div className="security-page-heading">
            <h2>Implemented technical controls</h2>
            <p>
              These statements describe current repository behavior, not an
              organizational compliance certification.
            </p>
          </div>
          <ul className="security-page-controls">
            {approvedClaims(securityClaims).map(({ detail, title }) => (
              <li key={title}>
                <CheckCircle2 aria-hidden="true" size={20} />
                <div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="security-limitations">
            <h2>Current limitations</h2>
            <ul>
              {limitations.map((limitation) => (
                <li key={limitation}>
                  <CircleDashed aria-hidden="true" size={19} /> {limitation}
                </li>
              ))}
            </ul>
            <p>{marketingConfig.productStatus}</p>
          </div>
        </MarketingContainer>
      </section>
    </main>
  );
}
