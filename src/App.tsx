import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DEFAULT_AUTHENTICATED_PATH, getNavigationItems } from '@/domain/auth';
import { AuthProvider } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { ClinicSettingsPage } from '@/features/settings/ClinicSettingsPage';
import { ClinicShell } from '@/features/shell/ClinicShell';
import { SectionPlaceholderPage } from '@/features/shell/SectionPlaceholderPage';
import { I18nProvider } from '@/i18n';

export function AppRoutes() {
  const navItems = getNavigationItems();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <ClinicShell />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={<Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />}
        />
        {navItems.map((item) => (
          <Route
            key={item.id}
            path={item.path}
            element={
              item.id === 'settings' ? (
                <ClinicSettingsPage />
              ) : (
                <SectionPlaceholderPage sectionId={item.id} />
              )
            }
          />
        ))}
        <Route
          path="*"
          element={<Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />}
        />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
