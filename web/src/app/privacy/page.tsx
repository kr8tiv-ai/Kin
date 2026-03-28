import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 sm:p-10">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mb-2">
              Privacy Policy
            </h1>
            <p className="text-sm text-white/30 mb-8">Last updated: March 27, 2026</p>

            <div className="prose-invert space-y-6 text-sm sm:text-base text-white/60 leading-relaxed">
              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  1. Information We Collect
                </h2>
                <p>
                  When you use KIN, we collect the following information:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1.5">
                  <li>
                    <strong className="text-white/80">Telegram Profile Data:</strong> Your Telegram user ID,
                    display name, username, and profile photo when you authenticate.
                  </li>
                  <li>
                    <strong className="text-white/80">Conversation Data:</strong> Messages you send to and receive
                    from your AI companions, used to provide personalized responses and maintain conversation history.
                  </li>
                  <li>
                    <strong className="text-white/80">Usage Data:</strong> Information about how you interact with
                    the Service, including message counts, feature usage, and companion preferences.
                  </li>
                  <li>
                    <strong className="text-white/80">Payment Data:</strong> If you subscribe to a paid plan,
                    payment processing is handled by our third-party provider. We do not store your
                    full credit card information.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  2. How We Use Your Information
                </h2>
                <p>We use your information to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1.5">
                  <li>Provide and personalize the KIN companion experience</li>
                  <li>Maintain conversation context and companion memory</li>
                  <li>Process payments and manage subscriptions</li>
                  <li>Improve our AI models and Service quality</li>
                  <li>Send important Service notifications</li>
                  <li>Prevent fraud and ensure platform security</li>
                </ul>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  3. Telegram Integration
                </h2>
                <p>
                  KIN operates as a Telegram bot. When you interact with your companion through
                  Telegram, messages are transmitted through Telegram&apos;s infrastructure before reaching
                  our servers. We recommend reviewing{' '}
                  <a
                    href="https://telegram.org/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan underline underline-offset-2 hover:text-cyan/80"
                  >
                    Telegram&apos;s Privacy Policy
                  </a>{' '}
                  for information about how they handle your data.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  4. Data Sharing
                </h2>
                <p>
                  <strong className="text-white/80">We do not sell your personal data.</strong> We may share
                  limited information with:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1.5">
                  <li>AI model providers for processing your companion interactions</li>
                  <li>Payment processors for handling subscriptions</li>
                  <li>Infrastructure providers for hosting and service delivery</li>
                </ul>
                <p className="mt-2">
                  All third-party providers are bound by data protection agreements and only receive
                  the minimum data necessary to perform their functions.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  5. Data Retention
                </h2>
                <p>
                  We retain your conversation data for as long as your account is active to maintain
                  your companion&apos;s memory and personalization. You can request deletion of your
                  conversation history at any time through the Service or by contacting support.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  6. Data Security
                </h2>
                <p>
                  We implement industry-standard security measures to protect your data, including
                  encryption in transit and at rest, access controls, and regular security audits.
                  However, no method of electronic transmission or storage is 100% secure.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  7. Your Rights
                </h2>
                <p>You have the right to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1.5">
                  <li>Access the personal data we hold about you</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data and account</li>
                  <li>Export your conversation history</li>
                  <li>Opt out of non-essential data processing</li>
                </ul>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  8. Children&apos;s Privacy
                </h2>
                <p>
                  KIN is not intended for children under 13. We do not knowingly collect personal
                  information from children under 13. If we learn that we have collected data from
                  a child under 13, we will take steps to delete that information promptly.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  9. Changes to This Policy
                </h2>
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of material
                  changes through the Service or via email. The &quot;Last updated&quot; date at the top of this
                  policy indicates when the most recent changes were made.
                </p>
              </section>

              <section>
                <h2 className="font-display text-lg font-semibold text-white/90 mb-3">
                  10. Contact Us
                </h2>
                <p>
                  For questions or concerns about this Privacy Policy or your data, please contact
                  us through our Telegram bot or at privacy@kin.kr8tiv.com.
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
