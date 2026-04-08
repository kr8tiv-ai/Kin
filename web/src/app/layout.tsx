import type { Metadata } from 'next';
import { Outfit, Plus_Jakarta_Sans, JetBrains_Mono, Noto_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { AuthProvider } from '@/providers/AuthProvider';
import { LocaleProvider } from '@/providers/LocaleProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { LazySupportWidget } from '@/components/ui/LazySupportWidget';
import { AnalyticsInit } from '@/components/AnalyticsInit';
import { Analytics } from '@vercel/analytics/react';
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

const notoSans = Noto_Sans({
  subsets: ['latin', 'cyrillic', 'greek'],
  variable: '--font-noto',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://meetyourkin.com'),
  title: {
    default: 'KIN — We Build You A Friend',
    template: '%s | KIN',
  },
  description:
    'Meet your AI companion that grows with you. KIN creates personalized AI friends that remember, learn, and evolve alongside you. Built on Bags.fm.',
  openGraph: {
    title: 'KIN — We Build You A Friend',
    description:
      'AI companions that grow with you. Chat, create, and build together.',
    siteName: 'KIN',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KIN — We Build You A Friend',
    description: 'AI companions that grow with you. Built on Bags.fm.',
  },
  robots: {
    index: true,
    follow: true,
  },
  keywords: ['AI companion', 'AI friend', 'chatbot', 'Telegram bot', 'Bags.fm', 'NFT companions', 'KIN', 'KR8TIV'],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`dark ${outfit.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} ${notoSans.variable}`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#00f0ff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KIN" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/* CJK font support — loaded from Google Fonts CDN to avoid bundling full CJK glyphs */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:rounded-lg focus:bg-cyan focus:px-4 focus:py-2 focus:text-black focus:text-sm focus:font-semibold">
          Skip to content
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocaleProvider initialLocale={locale}>
            <AuthProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </AuthProvider>
          </LocaleProvider>
        </NextIntlClientProvider>
        <LazySupportWidget />
        <AnalyticsInit />
        <Analytics />
        <div className="grain-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
