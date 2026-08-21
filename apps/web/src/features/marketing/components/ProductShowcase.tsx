import { comparisonCallouts } from '../content/site';
import { useSectionVisibility } from '../hooks/useSectionVisibility';
import { HeroProductStage } from './HeroProductStage';
import {
  DisplayHeading,
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function ProductShowcase() {
  const { ref, visible } = useSectionVisibility<HTMLDivElement>();

  return (
    <MarketingSection id="product-showcase" tone="paper">
      <MarketingContainer>
        <div className="marketing-section-intro">
          <SectionEyebrow>Visual comparison</SectionEyebrow>
          <DisplayHeading>
            See the change, then inspect the evidence.
          </DisplayHeading>
          <p>
            Move from visual orientation to format-aware detail without losing
            the exact versions or the review decision tied to them.
          </p>
        </div>
        <div
          className={`product-showcase-stage ${visible ? 'is-visible' : ''}`}
          ref={ref}
        >
          <HeroProductStage />
          <picture className="product-showcase-poster">
            <source
              media="(max-width: 639px)"
              srcSet="/marketing/comparison-workspace-mobile.webp"
            />
            <img
              alt="Synthetic MergeCom comparison showing a change navigator, two presentation versions, and an evidence inspector"
              decoding="async"
              height="514"
              loading="lazy"
              src="/marketing/comparison-workspace.webp"
              width="1280"
            />
          </picture>
        </div>
        <ol className="product-callouts">
          {comparisonCallouts.map((callout) => (
            <li key={callout.marker}>
              <span>{callout.marker}</span>
              <div>
                <h3>{callout.title}</h3>
                <p>{callout.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </MarketingContainer>
    </MarketingSection>
  );
}
