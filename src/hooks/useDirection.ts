import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RTL_LANGUAGES } from '../i18n';

export function useDirection() {
  const { i18n } = useTranslation();
  const lang = i18n.language.split('-')[0]; // 'he-IL' → 'he'
  const isRTL = RTL_LANGUAGES.includes(lang);

  useEffect(() => {
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  }, [lang, isRTL]);

  return { isRTL, dir: isRTL ? 'rtl' : 'ltr' as const };
}
