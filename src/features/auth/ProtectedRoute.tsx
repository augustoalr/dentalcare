import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthAccountIssueView } from '@/features/auth/AuthAccountIssueView';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/i18n';
import { LoadingState } from '@/ui/components/states/LoadingState';

export interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-12">
        <LoadingState
          className="w-full max-w-md"
          title={t('auth.checkingSessionTitle')}
          description={t('auth.checkingSessionDescription')}
        />
      </div>
    );
  }

  if (
    status === 'unauthenticated' ||
    status === 'session_expired' ||
    status === 'unconfigured'
  ) {
    const requestedPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from: requestedPath }} />;
  }

  if (status === 'profile_missing' || status === 'error') {
    return <AuthAccountIssueView mode={status} />;
  }

  return <>{children}</>;
}
