import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DEFAULT_AUTHENTICATED_PATH, getNavigationItems } from '@/domain/auth';
import { AuthProvider } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { PatientDetailPage } from '@/features/patients/PatientDetailPage';
import { PatientRepositoryProvider } from '@/features/patients/PatientRepositoryContext';
import { PatientsPage } from '@/features/patients/PatientsPage';
import { ClinicSettingsPage } from '@/features/settings/ClinicSettingsPage';
import { ClinicShell } from '@/features/shell/ClinicShell';
import { SectionPlaceholderPage } from '@/features/shell/SectionPlaceholderPage';
import { I18nProvider } from '@/i18n';
import type { IPatientRepository } from '@/services/repositories/patientRepository';

export interface AppRoutesProps {
  readonly patientRepository?: IPatientRepository | null;
}

export function AppRoutes({ patientRepository }: AppRoutesProps = {}) {
  const navItems = getNavigationItems();

  return (
    <PatientRepositoryProvider repository={patientRepository}>
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
                item.id === 'patients' ? (
                  <PatientsPage />
                ) : item.id === 'settings' ? (
                  <ClinicSettingsPage />
                ) : (
                  <SectionPlaceholderPage sectionId={item.id} />
                )
              }
            />
          ))}
          <Route path="/patients/:patientId" element={<PatientDetailPage />} />
          <Route
            path="*"
            element={<Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />}
          />
        </Route>
      </Routes>
    </PatientRepositoryProvider>
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
