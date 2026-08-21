import { FormatCapabilities } from '../components/FormatCapabilities';
import { FormatProofStrip } from '../components/FormatProofStrip';
import { HeroSection } from '../components/HeroSection';
import { ProductShowcase } from '../components/ProductShowcase';
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
    </main>
  );
}
