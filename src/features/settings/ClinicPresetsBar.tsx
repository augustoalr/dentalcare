import { Globe2 } from 'lucide-react';
import {
  CLINIC_SETTINGS_PRESETS,
  type ClinicSettingsPreset,
} from '@/domain/money';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';

export interface ClinicPresetsBarProps {
  readonly disabled: boolean;
  readonly onSelectPreset: (preset: ClinicSettingsPreset) => void;
}

export function ClinicPresetsBar({
  disabled,
  onSelectPreset,
}: ClinicPresetsBarProps) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <Globe2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <CardTitle>{t('settings.presets.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.presets.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {CLINIC_SETTINGS_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onSelectPreset(preset)}
            >
              {t(preset.labelKey)}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
