import { ArrowRight } from 'lucide-react';

import { FormatCapabilities } from '../components/FormatCapabilities';
import { FormatProofStrip } from '../components/FormatProofStrip';
import { FinalCta } from '../components/FinalCta';
import { HeroProductStage } from '../components/HeroProductStage';
import {
  DisplayHeading,
  MarketingButton,
  MarketingContainer,
  SectionEyebrow,
} from '../components/MarketingPrimitives';
import { ProductShowcase } from '../components/ProductShowcase';
import { WhyMergeCom } from '../components/WhyMergeCom';
import { WorkflowStory } from '../components/WorkflowStory';

export function ProductPage() {
  return (
    <main>
      <section className="product-page-hero">
        <div className="product-page-hero-media">
          <HeroProductStage />
          <div />
        </div>
        <MarketingContainer className="product-page-hero-content">
          <SectionEyebrow>Product overview</SectionEyebrow>
          <DisplayHeading as="h1">
            Document version control for Word, Excel, and PowerPoint.
          </DisplayHeading>
          <p>
            Preserve exact Office packages and move through comparison, review,
            approval, retrieval, and restore without losing the record.
          </p>
          <MarketingButton href="/request-access">
            Request access <ArrowRight aria-hidden="true" size={17} />
          </MarketingButton>
        </MarketingContainer>
      </section>
      <FormatProofStrip />
      <ProductShowcase />
      <WhyMergeCom />
      <WorkflowStory />
      <FormatCapabilities />
      <FinalCta />
    </main>
  );
}
