import './i18n';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { CoachMarkProvider } from './context/CoachMarkContext';
import { SplitSessionProvider } from './context/SplitSessionContext';
import { AppRouter } from './App';
import { CoachMarkOverlay } from './components/coach/CoachMarkOverlay';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <ThemeProvider>
      <CoachMarkProvider>
        <SplitSessionProvider>
          <AppRouter />
          <CoachMarkOverlay />
        </SplitSessionProvider>
      </CoachMarkProvider>
    </ThemeProvider>
  </AuthProvider>
);
