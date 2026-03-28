import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/landing/HeroSection';
import { CompanionShowcase } from '@/components/landing/CompanionShowcase';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { CTASection } from '@/components/landing/CTASection';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <CompanionShowcase />
        <HowItWorks />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
