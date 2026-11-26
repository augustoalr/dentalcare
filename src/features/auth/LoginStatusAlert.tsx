import { AlertTriangle, Clock } from 'lucide-react';
import type { AuthErrorCode, AuthStatus } from '@/domain/auth';
import { useI18n, type TranslationKey } from '@/i18n';
import { ErrorState } from '@/ui/components/states/ErrorState';

export interface LoginStatusAlertProps {
  status: AuthStatus;
  errorCode: AuthErrorCode | null;
}

function resolveErrorKeys(errorCode: AuthErrorCode): {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
} {
  switch (errorCode) {
    case 'invalid_credentials':
      return {
        titleKey: 'auth.errors.invalidCredentialsTitle',
        bodyKey: 'auth.errors.invalidCredentialsBody',
      };
    case 'email_not_confirmed':
      return {
        titleKey: 'auth.errors.emailNotConfirmedTitle',
        bodyKey: 'auth.errors.emailNotConfirmedBody',
      };
    case 'rate_limited':
      return {
        titleKey: 'auth.errors.rateLimitedTitle',
        bodyKey: 'auth.errors.rateLimitedBody',
      };
    case 'network_error':
      return {
        titleKey: 'auth.errors.networkErrorTitle',
        bodyKey: 'auth.errors.networkErrorBody',
      };
    case 'profile_missing':
      return {
        titleKey: 'auth.profileMissingTitle',
        bodyKey: 'auth.profileMissingDescription',
      };
    case 'session_expired':
      return {
        titleKey: 'auth.sessionExpiredTitle',
        bodyKey: 'auth.sessionExpiredBody',
      };
    case 'unconfigured':
      return {
        titleKey: 'auth.unconfiguredTitle',
        bodyKey: 'auth.unconfiguredBody',
      };
    case 'unknown':
      return {
        titleKey: 'auth.errors.unknownErrorTitle',
        bodyKey: 'auth.errors.unknownErrorBody',
      };
  }
}

export function LoginStatusAlert({ status, errorCode }: LoginStatusAlertProps) {
  const { t } = useI18n();

  if (status === 'unconfigured') {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4 text-warning-foreground"
      >
        <AlertTriangle
          className="mt-0.5 h-5 w-5 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold break-words">
            {t('auth.unconfiguredTitle')}
          </p>
          <p className="text-sm break-words">{t('auth.unconfiguredBody')}</p>
        </div>
      </div>
    );
  }

  if (status === 'session_expired') {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4 text-warning-foreground"
      >
        <Clock
          className="mt-0.5 h-5 w-5 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold break-words">
            {t('auth.sessionExpiredTitle')}
          </p>
          <p className="text-sm break-words">{t('auth.sessionExpiredBody')}</p>
        </div>
      </div>
    );
  }

  if (!errorCode) {
    return null;
  }

  const { titleKey, bodyKey } = resolveErrorKeys(errorCode);
  return <ErrorState title={t(titleKey)} description={t(bodyKey)} />;
}
