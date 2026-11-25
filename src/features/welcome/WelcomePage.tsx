import { CalendarDays, FileText, ShieldCheck, Stethoscope } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LanguageSwitcher } from '@/ui/components/LanguageSwitcher';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { MedicalAlertBanner } from '@/ui/components/states/MedicalAlertBanner';
import { Badge } from '@/ui/components/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';

export function WelcomePage() {
  const { t } = useI18n();

  const pillars = [
    {
      id: 'schedule',
      icon: CalendarDays,
      title: t('welcome.pillars.scheduleTitle'),
      description: t('welcome.pillars.scheduleDescription'),
    },
    {
      id: 'patients',
      icon: Stethoscope,
      title: t('welcome.pillars.patientsTitle'),
      description: t('welcome.pillars.patientsDescription'),
    },
    {
      id: 'billing',
      icon: FileText,
      title: t('welcome.pillars.billingTitle'),
      description: t('welcome.pillars.billingDescription'),
    },
  ] as const;

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary">
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-text-primary">
                  {t('app.name')}
                </span>
                <Badge variant="warning">{t('app.demoBadge')}</Badge>
              </div>
              <p className="truncate text-xs text-text-muted">
                {t('app.tagline')}
              </p>
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-auto">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="space-y-4">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl break-words">
            {t('welcome.heroTitle')}
          </h1>
          <p className="max-w-2xl text-base text-text-secondary break-words">
            {t('welcome.heroDescription')}
          </p>

          <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4 text-warning-foreground">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-warning"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold break-words">
                {t('welcome.sandboxNoticeTitle')}
              </p>
              <p className="text-sm break-words">
                {t('welcome.sandboxNoticeBody')}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('welcome.pillarsTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <Card key={pillar.id}>
                  <CardHeader>
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <CardTitle>{pillar.title}</CardTitle>
                    <CardDescription>{pillar.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('welcome.statesPreviewTitle')}
            </h2>
            <p className="text-sm text-text-muted">
              {t('welcome.statesPreviewDescription')}
            </p>
          </div>

          <MedicalAlertBanner
            label={t('medicalAlert.label')}
            title={t('medicalAlert.sampleTitle')}
            description={t('medicalAlert.sampleDescription')}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LoadingState
              title={t('states.loadingTitle')}
              description={t('states.loadingDescription')}
            />
            <ErrorState
              title={t('states.errorTitle')}
              description={t('states.errorDescription')}
              retryLabel={t('states.retry')}
              onRetry={() => {}}
            />
            <EmptyState
              title={t('states.emptyTitle')}
              description={t('states.emptyDescription')}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
