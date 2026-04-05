import './i18n';
import { initSentry, initPostHog } from './monitoring';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CoachMarkProvider } from './context/CoachMarkContext';
import { SplitSessionProvider } from './context/SplitSessionContext';
import { AppRouter } from './App';
import { CoachMarkOverlay } from './components/coach/CoachMarkOverlay';
import { ConsentBanner } from './components/consent/ConsentBanner';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

initSentry();
// PostHog: only initialise if the user has already accepted the consent banner.
// First-time visitors: PostHog stays silent until they click "Accept & Continue"
// (ConsentBanner calls initPostHog() on accept).
// Return visitors: consent is already stored in localStorage → init immediately.
if (localStorage.getItem('splitsnap_consent')) initPostHog();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <AuthProvider>
      <ThemeProvider>
        <CoachMarkProvider>
          <SplitSessionProvider>
            <AppRouter />
            <CoachMarkOverlay />
            <ConsentBanner />
          </SplitSessionProvider>
        </CoachMarkProvider>
      </ThemeProvider>
    </AuthProvider>
  </ErrorBoundary>
);
