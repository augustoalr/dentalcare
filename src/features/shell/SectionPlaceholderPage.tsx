import { getNavigationItems, type AppRouteId } from '@/domain/auth';
import { NAVIGATION_ICONS } from '@/features/shell/navigationIcons';
import { useI18n } from '@/i18n';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { Badge } from '@/ui/components/ui/badge';
import { Card, CardContent } from '@/ui/components/ui/card';

export interface SectionPlaceholderPageProps {
  sectionId: AppRouteId;
}

export function SectionPlaceholderPage({
  sectionId,
}: SectionPlaceholderPageProps) {
  const { t } = useI18n();
  const item = getNavigationItems().find(
    (candidate) => candidate.id === sectionId,
  );

  if (!item) {
    return null;
  }

  const Icon = NAVIGATION_ICONS[item.id];

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary break-words">
            {t(item.sectionTitleKey)}
          </h1>
          <Badge variant="default">{t('sections.emptyBadge')}</Badge>
        </div>
        <p className="max-w-3xl text-sm text-text-secondary break-words">
          {t(item.sectionDescriptionKey)}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<Icon className="h-5 w-5" aria-hidden="true" />}
            title={t('sections.emptyTitle')}
            description={t('sections.emptyDescription')}
          />
        </CardContent>
      </Card>
    </section>
  );
}
