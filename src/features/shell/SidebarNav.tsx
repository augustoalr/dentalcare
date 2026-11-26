import { NavLink } from 'react-router-dom';
import { getNavigationItems } from '@/domain/auth';
import { NAVIGATION_ICONS } from '@/features/shell/navigationIcons';
import { useI18n } from '@/i18n';
import { cn } from '@/ui/lib/utils';

export interface SidebarNavProps {
  onSelectItem?: () => void;
}

export function SidebarNav({ onSelectItem }: SidebarNavProps) {
  const { t } = useI18n();
  const items = getNavigationItems();

  return (
    <nav aria-label={t('nav.ariaLabel')} className="space-y-1">
      {items.map((item) => {
        const Icon = NAVIGATION_ICONS[item.id];
        return (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={onSelectItem}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{t(item.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
