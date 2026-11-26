import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SidebarNav } from '@/features/shell/SidebarNav';
import { useI18n } from '@/i18n';
import { BrandMark } from '@/ui/components/BrandMark';
import { Button } from '@/ui/components/ui/button';

export const MOBILE_DRAWER_ID = 'clinic-mobile-drawer';

export interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex lg:hidden">
      <div
        className="fixed inset-0 bg-text-primary/40"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        id={MOBILE_DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.mobileDrawerTitle')}
        className="relative z-50 flex w-72 max-w-full flex-col border-r border-border bg-surface-card p-4 shadow-lg"
      >
        <div className="mb-6 flex items-center justify-between gap-2 border-b border-border pb-4">
          <BrandMark showTagline={false} />
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <SidebarNav onSelectItem={onClose} />
        </div>
      </div>
    </div>
  );
}
