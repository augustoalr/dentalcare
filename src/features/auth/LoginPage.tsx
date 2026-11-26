import { useState, type FormEvent } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  sanitizeReturnTo,
  validateLoginCredentials,
  type LoginValidationResult,
} from '@/domain/auth';
import { AuthAccountIssueView } from '@/features/auth/AuthAccountIssueView';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginStatusAlert } from '@/features/auth/LoginStatusAlert';
import { useI18n } from '@/i18n';
import { BrandMark } from '@/ui/components/BrandMark';
import { LanguageSwitcher } from '@/ui/components/LanguageSwitcher';
import { SandboxNoticeBanner } from '@/ui/components/SandboxNoticeBanner';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';

function readReturnToFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) {
    return null;
  }
  const candidate = (state as { from?: unknown }).from;
  return typeof candidate === 'string' ? candidate : null;
}

export function LoginPage() {
  const { status, errorCode, isSigningIn, signIn, clearError } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validation, setValidation] = useState<LoginValidationResult | null>(
    null,
  );

  if (status === 'authenticated') {
    const destination = sanitizeReturnTo(readReturnToFromState(location.state));
    return <Navigate to={destination} replace />;
  }

  if (status === 'profile_missing' || status === 'error') {
    return <AuthAccountIssueView mode={status} />;
  }

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

  const isDisabled = isSigningIn || status === 'unconfigured';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDisabled) {
      return;
    }

    const result = validateLoginCredentials(email, password);
    setValidation(result);

    if (!result.valid) {
      return;
    }

    await signIn(result.normalizedEmail, password);
  };

  const emailErrorMessage =
    validation?.emailError === 'email_required'
      ? t('auth.validation.emailRequired')
      : validation?.emailError === 'email_invalid'
        ? t('auth.validation.emailInvalid')
        : null;

  const passwordErrorMessage =
    validation?.passwordError === 'password_required'
      ? t('auth.validation.passwordRequired')
      : null;

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <BrandMark />
            <Badge variant="warning">{t('app.demoBadge')}</Badge>
          </div>
          <div className="shrink-0 self-start sm:self-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <SandboxNoticeBanner />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t('auth.loginTitle')}</CardTitle>
            <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <LoginStatusAlert status={status} errorCode={errorCode} />

            <form noValidate onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">{t('auth.emailLabel')}</Label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  disabled={isDisabled}
                  aria-invalid={emailErrorMessage !== null}
                  aria-describedby={
                    emailErrorMessage ? 'login-email-error' : undefined
                  }
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validation) {
                      setValidation(null);
                    }
                    if (errorCode) {
                      clearError();
                    }
                  }}
                />
                {emailErrorMessage ? (
                  <p
                    id="login-email-error"
                    role="alert"
                    className="text-xs font-medium text-danger break-words"
                  >
                    {emailErrorMessage}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">
                  {t('auth.passwordLabel')}
                </Label>
                <Input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  disabled={isDisabled}
                  aria-invalid={passwordErrorMessage !== null}
                  aria-describedby={
                    passwordErrorMessage ? 'login-password-error' : undefined
                  }
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validation) {
                      setValidation(null);
                    }
                    if (errorCode) {
                      clearError();
                    }
                  }}
                />
                {passwordErrorMessage ? (
                  <p
                    id="login-password-error"
                    role="alert"
                    className="text-xs font-medium text-danger break-words"
                  >
                    {passwordErrorMessage}
                  </p>
                ) : null}
              </div>

              <Button type="submit" className="w-full" disabled={isDisabled}>
                {isSigningIn ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>{t('auth.submittingButton')}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    <span>{t('auth.submitButton')}</span>
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
