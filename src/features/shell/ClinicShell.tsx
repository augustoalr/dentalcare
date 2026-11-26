import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { ClinicHeader } from '@/features/shell/ClinicHeader';
import { MobileNavDrawer } from '@/features/shell/MobileNavDrawer';
import { SidebarNav } from '@/features/shell/SidebarNav';
import { useI18n } from '@/i18n';
import { BrandMark } from '@/ui/components/BrandMark';
import { Button } from '@/ui/components/ui/button';

export function ClinicShell() {
  const {
    clinic,
    profile,
    isSigningOut,
    localeSyncWarning,
    signOut,
    dismissLocaleSyncWarning,
  } = useAuth();
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!clinic || !profile) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full overflow-x-hidden bg-surface-canvas text-text-primary">
      <a
        href="#clinic-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        {t('shell.skipToContent')}
      </a>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface-card p-4 lg:flex">
        <div className="mb-6 border-b border-border pb-4">
          <BrandMark />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
      </aside>

      <MobileNavDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ClinicHeader
          clinic={clinic}
          profile={profile}
          isMobileMenuOpen={isMobileMenuOpen}
          isSigningOut={isSigningOut}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
          onSignOut={() => void signOut()}
        />

        {localeSyncWarning ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 border-b border-warning-border bg-warning-bg px-4 py-2.5 text-sm text-warning-foreground sm:px-6"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <span className="break-words">{t('shell.localeSyncWarning')}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissLocaleSyncWarning}
              aria-label={t('shell.dismissNotice')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        <main
          id="clinic-main-content"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
