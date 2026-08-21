import { workflowSteps } from '../content/site';
import { useSectionVisibility } from '../hooks/useSectionVisibility';
import {
  DisplayHeading,
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function WorkflowStory() {
  const { ref, visible } = useSectionVisibility<HTMLOListElement>();

  return (
    <MarketingSection id="workflow" tone="canvas">
      <MarketingContainer>
        <div className="workflow-heading">
          <SectionEyebrow>One controlled path</SectionEyebrow>
          <DisplayHeading>Save. Compare. Review. Restore.</DisplayHeading>
          <p>
            Each action advances the work while preserving the exact record that
            came before it.
          </p>
        </div>
        <ol
          className={`workflow-steps ${visible ? 'is-visible' : ''}`}
          ref={ref}
        >
          {workflowSteps.map(({ detail, icon: Icon, title }, index) => (
            <li key={title}>
              <span className="workflow-step-number">0{index + 1}</span>
              <Icon aria-hidden="true" size={24} />
              <h3>{title}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ol>
      </MarketingContainer>
    </MarketingSection>
  );
}
