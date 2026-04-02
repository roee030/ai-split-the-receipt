import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../context/SplitSessionContext';

export function TermsScreen() {
  const { setScreen } = useSession();
  const { t } = useTranslation();

  return (
    <motion.div
      className="min-h-screen bg-bg dark:bg-[#1A1A1A] px-5 py-6 overflow-y-auto"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <button
        onClick={() => setScreen('home')}
        className="flex items-center gap-2 text-muted mb-6 min-h-[44px]"
        aria-label={t('auth.back')}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <h1 className="text-2xl font-display font-bold text-primary dark:text-[#F0F0F0] mb-2">
        {t('legal.termsTitle')}
      </h1>
      <p className="text-xs text-muted mb-8">{t('legal.lastUpdated')}</p>

      <div className="space-y-6">
        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Acceptance of Terms</h2>
          <p className="text-sm text-muted leading-relaxed">
            By using SplitSnap, you agree to these Terms of Service. If you do not agree,
            please do not use the app.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Service Description</h2>
          <p className="text-sm text-muted leading-relaxed">
            SplitSnap is a receipt-scanning and bill-splitting application. We use AI to
            read receipt images and help groups split costs fairly.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Free Tier and Subscriptions</h2>
          <p className="text-sm text-muted leading-relaxed">
            New users receive 5 free receipt scans. After that, a subscription of $0.99/month
            is required for unlimited scanning. Subscriptions are billed monthly and can be
            cancelled at any time. No refunds are provided for partial months.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Accuracy Disclaimer</h2>
          <p className="text-sm text-muted leading-relaxed">
            SplitSnap uses AI to read receipts. While we strive for accuracy, AI-generated
            results may contain errors. Always verify totals before making payments.
            We are not liable for financial decisions made based on the app's output.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Prohibited Uses</h2>
          <p className="text-sm text-muted leading-relaxed">
            You may not use SplitSnap to scan documents other than receipts and bills,
            attempt to bypass scan limits through multiple accounts, or reverse-engineer
            the application.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Governing Law</h2>
          <p className="text-sm text-muted leading-relaxed">
            These Terms are governed by the laws of Israel. Disputes shall be resolved in
            the courts of Tel Aviv.
          </p>
        </section>
      </div>
    </motion.div>
  );
}
