import { I18nProvider } from '@/i18n';
import { WelcomePage } from '@/features/welcome/WelcomePage';

export function App() {
  return (
    <I18nProvider>
      <WelcomePage />
    </I18nProvider>
  );
}

export default App;
