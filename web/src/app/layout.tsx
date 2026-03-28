import type { Metadata } from 'next';
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { AuthProvider } from '@/providers/AuthProvider';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KIN — We Build You A Friend',
  description:
    'Meet your AI companion that grows with you. KIN creates personalized AI friends that remember, learn, and evolve alongside you.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${outfit.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-body">
        <AuthProvider>
          {children}
        </AuthProvider>
        <div className="grain-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
