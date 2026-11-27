import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DEFAULT_AUTHENTICATED_PATH, getNavigationItems } from '@/domain/auth';
import { AuthProvider } from '@/features/auth/AuthContext';
import { LoginPage } from '@/features/auth/LoginPage';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { PatientDetailPage } from '@/features/patients/PatientDetailPage';
import { PatientFileRepositoryProvider } from '@/features/patients/PatientFileRepositoryContext';
import { PatientRepositoryProvider } from '@/features/patients/PatientRepositoryContext';
import { PatientsPage } from '@/features/patients/PatientsPage';
import { ClinicSettingsPage } from '@/features/settings/ClinicSettingsPage';
import { ClinicShell } from '@/features/shell/ClinicShell';
import { SectionPlaceholderPage } from '@/features/shell/SectionPlaceholderPage';
import { I18nProvider } from '@/i18n';
import type { IImageOptimizer } from '@/services/media/imageOptimizer';
import type { IPatientFileRepository } from '@/services/repositories/patientFileRepository';
import type { IPatientRepository } from '@/services/repositories/patientRepository';

export interface AppRoutesProps {
  readonly patientRepository?: IPatientRepository | null;
  readonly patientFileRepository?: IPatientFileRepository | null;
  readonly imageOptimizer?: IImageOptimizer;
}

export function AppRoutes({
  patientRepository,
  patientFileRepository,
  imageOptimizer,
}: AppRoutesProps = {}) {
  const navItems = getNavigationItems();

  return (
    <PatientRepositoryProvider repository={patientRepository}>
      <PatientFileRepositoryProvider repository={patientFileRepository}>
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
            <Route
              path="/patients/:patientId"
              element={<PatientDetailPage imageOptimizer={imageOptimizer} />}
            />
            <Route
              path="*"
              element={<Navigate to={DEFAULT_AUTHENTICATED_PATH} replace />}
            />
          </Route>
        </Routes>
      </PatientFileRepositoryProvider>
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
