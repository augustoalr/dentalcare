import { LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/i18n';
import { BrandMark } from '@/ui/components/BrandMark';
import { LanguageSwitcher } from '@/ui/components/LanguageSwitcher';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface AuthAccountIssueViewProps {
  mode: 'profile_missing' | 'error';
}

export function AuthAccountIssueView({ mode }: AuthAccountIssueViewProps) {
  const { signOut, retrySessionLoad, isSigningOut } = useAuth();
  const { t } = useI18n();

  const title =
    mode === 'profile_missing'
      ? t('auth.profileMissingTitle')
      : t('auth.sessionLoadErrorTitle');

  const description =
    mode === 'profile_missing'
      ? t('auth.profileMissingDescription')
      : t('auth.sessionLoadErrorDescription');

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark showTagline={false} />
            <Badge variant="warning">{t('app.demoBadge')}</Badge>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-12 sm:px-6">
        <ErrorState
          title={title}
          description={description}
          retryLabel={mode === 'error' ? t('states.retry') : undefined}
          onRetry={mode === 'error' ? () => void retrySessionLoad() : undefined}
        />

        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void signOut()}
            disabled={isSigningOut}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>
              {isSigningOut ? t('auth.signingOutButton') : t('auth.signOutButton')}
            </span>
          </Button>
        </div>
      </main>
    </div>
  );
}
