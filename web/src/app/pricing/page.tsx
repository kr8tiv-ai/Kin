import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PricingSection } from '@/components/landing/PricingSection';
import { PricingFAQ } from './PricingFAQ';

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20 sm:pt-24">
        <PricingSection />
        <PricingFAQ />
      </main>
      <Footer />
    </>
  );
}
