import { ArrowRight } from 'lucide-react';

import {
  DisplayHeading,
  MarketingButton,
  MarketingContainer,
} from './MarketingPrimitives';

export function FinalCta() {
  return (
    <section className="final-cta">
      <MarketingContainer>
        <p>Ready for a controlled workspace?</p>
        <DisplayHeading>Bring order to every version.</DisplayHeading>
        <div>
          <MarketingButton href="/request-access">
            Request access <ArrowRight aria-hidden="true" size={17} />
          </MarketingButton>
          <MarketingButton href="/login" variant="ghost">
            Sign in
          </MarketingButton>
        </div>
      </MarketingContainer>
    </section>
  );
}
