import { ArrowRight } from 'lucide-react';

import {
  approvedClaims,
  marketingConfig,
  securityClaims,
} from '../content/site';
import {
  DisplayHeading,
  MarketingButton,
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function SecurityChapter() {
  return (
    <MarketingSection id="security" tone="night">
      <MarketingContainer>
        <div className="security-chapter-heading">
          <div>
            <SectionEyebrow>Security by design</SectionEyebrow>
            <DisplayHeading>
              Control starts with the original file.
            </DisplayHeading>
          </div>
          <div>
            <p>
              Technical controls protect source artifacts, isolate processing,
              and keep authorization attached to the organization and project.
            </p>
            <MarketingButton href="/security" variant="ghost">
              Current security posture{' '}
              <ArrowRight aria-hidden="true" size={17} />
            </MarketingButton>
          </div>
        </div>
        <ul className="security-evidence-list">
          {approvedClaims(securityClaims).map(
            ({ detail, icon: Icon, title }) => (
              <li key={title}>
                <Icon aria-hidden="true" size={23} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ),
          )}
        </ul>
        <p className="security-preview-note">{marketingConfig.productStatus}</p>
      </MarketingContainer>
    </MarketingSection>
  );
}
