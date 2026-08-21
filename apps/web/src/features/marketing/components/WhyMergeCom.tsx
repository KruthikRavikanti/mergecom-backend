import { approvedClaims, benefits } from '../content/site';
import {
  DisplayHeading,
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function WhyMergeCom() {
  return (
    <MarketingSection tone="warm">
      <MarketingContainer className="why-mergecom-grid">
        <div className="why-mergecom-heading">
          <SectionEyebrow>Why MergeCom</SectionEyebrow>
          <DisplayHeading>
            Why document-heavy teams choose MergeCom
          </DisplayHeading>
        </div>
        <ol className="benefit-list">
          {approvedClaims(benefits).map(
            ({ detail, icon: Icon, title }, index) => (
              <li key={title}>
                <span>0{index + 1}</span>
                <Icon aria-hidden="true" size={22} />
                <div>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </div>
              </li>
            ),
          )}
        </ol>
      </MarketingContainer>
    </MarketingSection>
  );
}
