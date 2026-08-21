import { ArrowDown, ArrowRight } from 'lucide-react';

import { heroContent, marketingConfig } from '../content/site';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { HeroProductStage } from './HeroProductStage';
import {
  DisplayHeading,
  MarketingButton,
  MarketingContainer,
} from './MarketingPrimitives';

export function HeroSection() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <section
      className="marketing-hero"
      data-motion={reducedMotion ? 'reduced' : 'allowed'}
    >
      <div className="marketing-hero-media">
        <HeroProductStage />
        <picture className="marketing-hero-poster">
          <source
            media="(max-width: 639px)"
            srcSet="/marketing/comparison-workspace-mobile.webp"
          />
          <img
            alt=""
            decoding="async"
            height="514"
            src="/marketing/comparison-workspace.webp"
            width="1280"
          />
        </picture>
        <div className="marketing-hero-overlay" />
      </div>
      <MarketingContainer className="marketing-hero-content">
        <p className="marketing-preview-label">
          <span /> {marketingConfig.previewLabel}
        </p>
        <DisplayHeading as="h1">{heroContent.headline}</DisplayHeading>
        <p className="marketing-hero-description">{heroContent.description}</p>
        <div className="marketing-hero-actions">
          <MarketingButton href={heroContent.primaryAction.href}>
            {heroContent.primaryAction.label}
            <ArrowRight aria-hidden="true" size={17} />
          </MarketingButton>
          <MarketingButton
            href={heroContent.secondaryAction.href}
            variant="ghost"
          >
            {heroContent.secondaryAction.label}
            <ArrowDown aria-hidden="true" size={17} />
          </MarketingButton>
        </div>
      </MarketingContainer>
      <p className="marketing-hero-caption">
        Synthetic product workspace. No customer information shown.
      </p>
    </section>
  );
}
