import { productProof } from '../content/site';
import {
  MarketingContainer,
  MarketingSection,
  SectionEyebrow,
} from './MarketingPrimitives';

export function ProductProof() {
  return (
    <MarketingSection aria-labelledby="product-proof-title" tone="warm">
      <MarketingContainer>
        <SectionEyebrow>By the product</SectionEyebrow>
        <h2 className="sr-only" id="product-proof-title">
          Implemented product facts
        </h2>
        <dl className="product-proof-list">
          {productProof.map((proof) => (
            <div key={proof.detail}>
              <dt>{proof.detail}</dt>
              <dd>{proof.value}</dd>
            </div>
          ))}
        </dl>
      </MarketingContainer>
    </MarketingSection>
  );
}
