import { ArrowRight, BookOpen, LifeBuoy, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  MarketingContainer,
  SectionEyebrow,
} from '../components/MarketingPrimitives';
import { marketingConfig } from '../content/site';

export function MarketingSupportPage() {
  const emailHref = marketingConfig.supportEmail
    ? `mailto:${marketingConfig.supportEmail}?subject=${encodeURIComponent('MergeCom support request')}`
    : null;

  return (
    <main className="marketing-page support-page">
      <section className="marketing-page-hero">
        <MarketingContainer>
          <LifeBuoy aria-hidden="true" size={32} />
          <SectionEyebrow>Support</SectionEyebrow>
          <h1>Help for the current workspace.</h1>
          <p>
            Use an approved support channel and keep document content or client
            information out of the initial request.
          </p>
        </MarketingContainer>
      </section>
      <section className="support-options">
        <MarketingContainer className="support-options-grid">
          <article>
            <BookOpen aria-hidden="true" size={25} />
            <h2>Product guidance</h2>
            <p>
              Review the implemented Save, Compare, Review, and Restore workflow
              before opening a support request.
            </p>
            <Link to="/product#workflow">
              Open product guide <ArrowRight aria-hidden="true" size={16} />
            </Link>
          </article>
          <article>
            <Mail aria-hidden="true" size={25} />
            <h2>Support channel</h2>
            {emailHref ? (
              <>
                <p>
                  Your email application will open. This site does not collect
                  or transmit the request.
                </p>
                <a href={emailHref}>
                  Email support <ArrowRight aria-hidden="true" size={16} />
                </a>
              </>
            ) : (
              <p role="status">
                Online ticket delivery is not connected. Contact your MergeCom
                administrator through your existing approved channel. Nothing
                has been submitted here.
              </p>
            )}
          </article>
        </MarketingContainer>
      </section>
    </main>
  );
}
