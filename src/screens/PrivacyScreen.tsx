import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../context/SplitSessionContext';

export function PrivacyScreen() {
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
        {t('legal.privacyTitle')}
      </h1>
      <p className="text-xs text-muted mb-8">{t('legal.lastUpdated')}</p>

      <div className="space-y-6">
        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">What we collect</h2>
          <p className="text-sm text-muted leading-relaxed">
            We collect your name, email address, and scan history when you create an account.
            This data is stored securely in Google Firebase and is used solely to provide
            the app's functionality — saving your scan history and managing your subscription.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">How we use your data</h2>
          <p className="text-sm text-muted leading-relaxed">
            Your data is used to: authenticate you, store your scan history, track your
            free scan quota, and process subscription payments via Stripe.
            We do not sell, rent, or share your data with third parties for marketing purposes.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Data retention</h2>
          <p className="text-sm text-muted leading-relaxed">
            Your data is retained as long as your account is active.
            You can delete your account and all associated data at any time from Settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Your rights (GDPR)</h2>
          <p className="text-sm text-muted leading-relaxed">
            If you are in the EU, you have the right to access, correct, or delete your
            personal data. To exercise these rights, use the "Delete my account" option in
            Settings, or contact us at privacy@splitsnap.app.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">California residents (CCPA)</h2>
          <p className="text-sm text-muted leading-relaxed">
            We do not sell your personal information. California residents have the right to
            know what personal information we collect and to request its deletion.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Cookies and tracking</h2>
          <p className="text-sm text-muted leading-relaxed">
            We use Firebase Authentication which stores a session token in your browser.
            We do not use advertising trackers or third-party analytics cookies.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-2 text-primary dark:text-[#F0F0F0]">Contact</h2>
          <p className="text-sm text-muted leading-relaxed">
            Questions? Email us at privacy@splitsnap.app
          </p>
        </section>
      </div>
    </motion.div>
  );
}
