import { FormatCapabilities } from '../components/FormatCapabilities';
import { FormatProofStrip } from '../components/FormatProofStrip';
import { FinalCta } from '../components/FinalCta';
import { HeroSection } from '../components/HeroSection';
import { ProductProof } from '../components/ProductProof';
import { ProductShowcase } from '../components/ProductShowcase';
import { SecurityChapter } from '../components/SecurityChapter';
import { UseCasesSection } from '../components/UseCasesSection';
import { WhyMergeCom } from '../components/WhyMergeCom';
import { WorkflowStory } from '../components/WorkflowStory';

export function MarketingHomePage() {
  return (
    <main>
      <HeroSection />
      <FormatProofStrip />
      <ProductShowcase />
      <WhyMergeCom />
      <WorkflowStory />
      <FormatCapabilities />
      <UseCasesSection />
      <ProductProof />
      <SecurityChapter />
      <FinalCta />
    </main>
  );
}
