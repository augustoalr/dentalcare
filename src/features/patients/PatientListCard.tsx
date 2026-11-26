import { ChevronRight, Mail, Phone, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  hasCriticalMedicalAlerts,
  type PatientRecord,
} from '@/domain/patients';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';

export interface PatientListCardProps {
  readonly patient: PatientRecord;
}

export function PatientListCard({ patient }: PatientListCardProps) {
  const { t } = useI18n();
  const hasMedicalAlert = hasCriticalMedicalAlerts(patient.medicalAlerts);
  const ariaLabel = t('patients.list.openRecordAria').replace(
    '{name}',
    patient.fullName,
  );

  return (
    <Link
      to={`/patients/${patient.id}`}
      aria-label={ariaLabel}
      className="group flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-card p-4 transition-colors hover:border-primary/50 hover:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <p className="min-w-0 max-w-full truncate text-base font-semibold text-text-primary break-words">
            {patient.fullName}
          </p>

          {hasMedicalAlert ? (
            <Badge variant="medical" className="shrink-0">
              <ShieldAlert
                className="h-3.5 w-3.5 shrink-0 text-medical-alert"
                aria-hidden="true"
              />
              <span>{t('patients.list.medicalAlertBadge')}</span>
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary min-w-0">
          {patient.phone ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
              <Phone
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <span className="truncate">{patient.phone}</span>
            </span>
          ) : null}

          {patient.email ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
              <Mail
                className="h-3.5 w-3.5 shrink-0 text-text-muted"
                aria-hidden="true"
              />
              <span className="truncate">{patient.email}</span>
            </span>
          ) : null}

          {!patient.phone && !patient.email ? (
            <span className="text-text-muted">
              {t('patients.list.noContactInfo')}
            </span>
          ) : null}
        </div>

        {hasMedicalAlert && patient.medicalAlerts ? (
          <p className="min-w-0 max-w-full truncate text-xs font-medium text-medical-alert-foreground break-words">
            {patient.medicalAlerts}
          </p>
        ) : null}
      </div>

      <ChevronRight
        className="mt-1 h-5 w-5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}
