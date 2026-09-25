/**
 * i18n bootstrap (#558).
 *
 * This is the start of the app's string-externalization migration, not the
 * whole thing — see the acceptance criteria on #558. It wires up
 * i18next/react-i18next as a plain singleton (no NextIntlClientProvider-style
 * wrapper, no locale-prefixed routing) so any client component can just
 * `import '@/lib/i18n'` for the side-effecting init and then call
 * `useTranslation(namespace)`.
 *
 * Scope of this PR: the `dashboard` namespace, covering `/dashboard` as the
 * proof-of-concept page named in the issue. Follow-up work should add one
 * namespace per page/feature area as they're migrated, plus additional
 * `lng` resources once a second language is actually needed.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import dashboardEn from './locales/en/dashboard.json';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: {
        dashboard: dashboardEn,
      },
    },
    lng: 'en',
    fallbackLng: 'en',
    ns: ['dashboard'],
    defaultNS: 'dashboard',
    interpolation: {
      // React already escapes output — i18next's own escaping would double-
      // escape values passed through JSX.
      escapeValue: false,
    },
    // No secondary language yet — surfacing missing-key warnings would just
    // be noise while only `en` exists (#558 is deliberately single-locale).
    returnEmptyString: false,
  });
}

export default i18n;
