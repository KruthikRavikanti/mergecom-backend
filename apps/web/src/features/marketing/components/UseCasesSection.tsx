import { ArrowDownRight } from 'lucide-react';

import { useCases } from '../content/site';
import {
  DisplayHeading,
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function UseCasesSection() {
  return (
    <MarketingSection id="use-cases" tone="paper">
      <MarketingContainer>
        <div className="use-cases-heading">
          <SectionEyebrow>Use cases</SectionEyebrow>
          <DisplayHeading>
            Built for teams where document versions carry real consequences.
          </DisplayHeading>
          <p>
            These examples describe document workflows, not current customer
            relationships or promised outcomes.
          </p>
        </div>
        <ol className="use-case-list">
          {useCases.map((useCase, index) => (
            <li key={useCase.title}>
              <span>0{index + 1}</span>
              <div>
                <h3>{useCase.title}</h3>
                <p>{useCase.detail}</p>
              </div>
              <div className="use-case-capability">
                <ArrowDownRight aria-hidden="true" size={19} />
                <span>{useCase.capability}</span>
              </div>
            </li>
          ))}
        </ol>
      </MarketingContainer>
    </MarketingSection>
  );
}
