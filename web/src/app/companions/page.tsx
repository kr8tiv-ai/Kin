import type { Metadata } from 'next';
import { CompanionsContent } from './CompanionsContent';

export const metadata: Metadata = {
  title: 'The Genesis Six — KIN Companions',
  description:
    'Meet the six AI companions of KIN. Each has a unique personality, skills, and style — from Cipher the Code Kraken to Catalyst the motivator. Choose the one that resonates with you.',
  openGraph: {
    title: 'The Genesis Six — KIN Companions',
    description:
      'Six AI companions, each with their own personality, skills, and style. Choose the one that resonates with you.',
    type: 'website',
  },
};

export default function CompanionsPage() {
  return <CompanionsContent />;
}
