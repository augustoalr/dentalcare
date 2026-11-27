import { useState } from 'react';
import { Archive, RotateCcw, ShieldAlert } from 'lucide-react';
import { formatPatientFileDate } from '@/domain/patientFiles';
import {
  hasCriticalMedicalAlerts,
  type ArchivedPatientRecord,
} from '@/domain/patients';
import { PatientFileActionConfirmPanel } from '@/features/patients/PatientFileActionConfirmPanel';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';

export interface ArchivedPatientCardProps {
  readonly patient: ArchivedPatientRecord;
  readonly onRestore: (patient: ArchivedPatientRecord) => Promise<void>;
}

export function ArchivedPatientCard({
  patient,
  onRestore,
}: ArchivedPatientCardProps) {
  const { locale, t } = useI18n();
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasRestoreError, setHasRestoreError] = useState(false);

  const hasMedicalAlert = hasCriticalMedicalAlerts(patient.medicalAlerts);
  const formattedArchivedDate = formatPatientFileDate(patient.deletedAt, locale);

  const handleConfirmRestore = async () => {
    if (isRestoring) {
      return;
    }

    setIsRestoring(true);
    setHasRestoreError(false);

    try {
      await onRestore(patient);
    } catch {
      setHasRestoreError(true);
      setIsRestoring(false);
    }
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-surface-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <p className="min-w-0 max-w-full line-clamp-2 text-base font-semibold text-text-primary break-words [overflow-wrap:anywhere]">
              {patient.fullName}
            </p>

            <Badge variant="default" className="shrink-0">
              <Archive className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t('patients.archived.badge')}</span>
            </Badge>

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

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <span>
              {t('patients.archived.archivedOn').replace(
                '{date}',
                formattedArchivedDate,
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span className="break-words">
              {t('patients.archived.statusHint')}
            </span>
          </div>
        </div>

        {!isConfirmingRestore ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setHasRestoreError(false);
                setIsConfirmingRestore(true);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('patients.archived.restoreButton')}</span>
            </Button>
          </div>
        ) : null}
      </div>

      {isConfirmingRestore ? (
        <PatientFileActionConfirmPanel
          tone="primary"
          title={t('patients.archived.restoreConfirm.title')}
          description={t('patients.archived.restoreConfirm.description')}
          confirmLabel={t('patients.archived.restoreConfirm.confirmButton')}
          busyLabel={t('patients.archived.restoreConfirm.restoringButton')}
          cancelLabel={t('patients.archived.restoreConfirm.cancelButton')}
          errorTitle={t('patients.archived.restoreConfirm.errorTitle')}
          errorDescription={t(
            'patients.archived.restoreConfirm.errorDescription',
          )}
          confirmIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          isBusy={isRestoring}
          hasError={hasRestoreError}
          onConfirm={() => void handleConfirmRestore()}
          onCancel={() => {
            setIsConfirmingRestore(false);
            setHasRestoreError(false);
          }}
        />
      ) : null}
    </article>
  );
}
