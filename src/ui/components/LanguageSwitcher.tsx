import { Languages } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-card p-1"
      role="group"
      aria-label={t('language.label')}
    >
      <Languages
        className="ml-1.5 mr-1 h-4 w-4 text-text-muted shrink-0"
        aria-hidden="true"
      />
      <Button
        size="sm"
        variant={locale === 'en' ? 'default' : 'ghost'}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        aria-label={t('language.switchToEn')}
      >
        {t('language.en')}
      </Button>
      <Button
        size="sm"
        variant={locale === 'es' ? 'default' : 'ghost'}
        onClick={() => setLocale('es')}
        aria-pressed={locale === 'es'}
        aria-label={t('language.switchToEs')}
      >
        {t('language.es')}
      </Button>
    </div>
  );
}
