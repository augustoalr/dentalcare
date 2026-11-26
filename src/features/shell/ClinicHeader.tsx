import { Building2, LogOut, Menu } from 'lucide-react';
import { getRoleLabelKey } from '@/domain/auth';
import { MOBILE_DRAWER_ID } from '@/features/shell/MobileNavDrawer';
import { useI18n } from '@/i18n';
import type {
  ClinicSummary,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import { LanguageSwitcher } from '@/ui/components/LanguageSwitcher';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface ClinicHeaderProps {
  clinic: ClinicSummary;
  profile: UserProfile;
  isMobileMenuOpen: boolean;
  isSigningOut: boolean;
  onToggleMobileMenu: () => void;
  onSignOut: () => void;
}

export function ClinicHeader({
  clinic,
  profile,
  isMobileMenuOpen,
  isSigningOut,
  onToggleMobileMenu,
  onSignOut,
}: ClinicHeaderProps) {
  const { t } = useI18n();
  const roleLabel = t(getRoleLabelKey(profile.role));

  return (
    <header className="border-b border-border bg-surface-card">
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 lg:hidden"
            onClick={onToggleMobileMenu}
            aria-expanded={isMobileMenuOpen}
            aria-controls={isMobileMenuOpen ? MOBILE_DRAWER_ID : undefined}
            aria-label={
              isMobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')
            }
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Building2
                className="h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span
                className="truncate text-base font-semibold text-text-primary"
                title={clinic.name}
              >
                {clinic.name}
              </span>
            </div>

            <Badge variant="warning" className="shrink-0">
              {t('app.demoBadge')}
            </Badge>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 lg:justify-end">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="max-w-48 truncate text-sm font-medium text-text-primary"
              title={profile.fullName}
            >
              {profile.fullName}
            </span>
            <Badge variant="primary" className="shrink-0">
              {roleLabel}
            </Badge>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />

            <Button
              variant="outline"
              size="sm"
              onClick={onSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>
                {isSigningOut
                  ? t('auth.signingOutButton')
                  : t('auth.signOutButton')}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
