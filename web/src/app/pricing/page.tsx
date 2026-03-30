import type { Metadata } from 'next';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'Pricing — KIN',
  description:
    'Choose your KIN plan. Free tier with Groq-powered AI chat, Pro tier with premium models and voice companions, Enterprise for teams.',
  openGraph: {
    title: 'Pricing — KIN',
    description: 'Choose your KIN plan. Start free, upgrade when ready.',
    type: 'website',
  },
};
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
