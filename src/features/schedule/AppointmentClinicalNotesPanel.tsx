import { useState, type FormEvent } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import {
  APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH,
  validateClinicalNotesInput,
} from '@/domain/appointments';
import type { UserRole } from '@/domain/auth';
import { useI18n } from '@/i18n';
import { Button } from '@/ui/components/ui/button';
import { Label } from '@/ui/components/ui/label';
import { Textarea } from '@/ui/components/ui/textarea';

export interface AppointmentClinicalNotesPanelProps {
  readonly appointmentId: string;
  readonly role: UserRole;
  readonly initialNotes: string | null;
  readonly onSave: (notes: string | null) => Promise<void>;
  readonly onClose: () => void;
}

export function AppointmentClinicalNotesPanel({
  appointmentId,
  role,
  initialNotes,
  onSave,
  onClose,
}: AppointmentClinicalNotesPanelProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initialNotes ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaveError, setHasSaveError] = useState(false);

  const textareaId = `clinical-notes-${appointmentId}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const result = validateClinicalNotesInput(draft, role);
    if (!result.valid) {
      setValidationError(
        result.error === 'clinical_notes_too_long'
          ? t('schedule.validation.clinicalNotesTooLong')
          : t('schedule.validation.clinicalNotesForbidden'),
      );
      return;
    }

    setValidationError(null);
    setHasSaveError(false);
    setIsSaving(true);

    try {
      await onSave(result.value);
      setIsSaving(false);
    } catch {
      setHasSaveError(true);
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-3 rounded-lg border border-primary/25 bg-surface-muted/50 p-3.5"
      noValidate
    >
      <div className="flex items-start gap-2">
        <FileText
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold text-text-primary break-words">
            {t('schedule.clinicalNotes.title')}
          </p>
          <p className="text-xs text-text-secondary break-words">
            {t('schedule.clinicalNotes.description')}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={textareaId}>{t('schedule.clinicalNotes.label')}</Label>
        <Textarea
          id={textareaId}
          rows={4}
          maxLength={APPOINTMENT_CLINICAL_NOTES_MAX_LENGTH}
          value={draft}
          placeholder={t('schedule.clinicalNotes.placeholder')}
          disabled={isSaving}
          aria-invalid={validationError !== null}
          onChange={(e) => {
            setDraft(e.target.value);
            if (validationError !== null) {
              setValidationError(null);
            }
          }}
        />
        <p className="text-xs text-text-muted break-words">
          {t('schedule.clinicalNotes.hint')}
        </p>
        {validationError ? (
          <p role="alert" className="text-xs font-medium text-danger break-words">
            {validationError}
          </p>
        ) : null}
      </div>

      {hasSaveError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-0.5">
            <p className="font-semibold break-words">
              {t('schedule.clinicalNotes.errorTitle')}
            </p>
            <p className="break-words">
              {t('schedule.clinicalNotes.errorDescription')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving
            ? t('schedule.clinicalNotes.savingButton')
            : t('schedule.clinicalNotes.saveButton')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSaving}
          onClick={onClose}
        >
          {t('schedule.clinicalNotes.cancelButton')}
        </Button>
      </div>
    </form>
  );
}
