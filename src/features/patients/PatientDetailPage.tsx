import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  FileText,
  Mail,
  Pencil,
  Phone,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  calculatePatientAge,
  formatCalendarDateForLocale,
  hasCriticalMedicalAlerts,
  type PatientInput,
  type PatientRecord,
} from '@/domain/patients';
import { useAuth } from '@/features/auth/AuthContext';
import { PatientArchiveConfirmPanel } from '@/features/patients/PatientArchiveConfirmPanel';
import { PatientFilesSection } from '@/features/patients/PatientFilesSection';
import { PatientForm } from '@/features/patients/PatientForm';
import { usePatientRepository } from '@/features/patients/PatientRepositoryContext';
import { useI18n } from '@/i18n';
import type { IImageOptimizer } from '@/services/media/imageOptimizer';
import type { IPatientFileRepository } from '@/services/repositories/patientFileRepository';
import type { IPatientRepository } from '@/services/repositories/patientRepository';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { MedicalAlertBanner } from '@/ui/components/states/MedicalAlertBanner';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/ui/components/ui/card';

export interface PatientDetailPageProps {
  readonly patientRepository?: IPatientRepository | null;
  readonly patientFileRepository?: IPatientFileRepository | null;
  readonly imageOptimizer?: IImageOptimizer;
}

export function PatientDetailPage({
  patientRepository,
  patientFileRepository,
  imageOptimizer,
}: PatientDetailPageProps) {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { status: authStatus, clinic } = useAuth();
  const { locale, t } = useI18n();
  const repository = usePatientRepository(patientRepository);

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [hasArchiveError, setHasArchiveError] = useState(false);

  const requestIdRef = useRef(0);

  const loadPatient = useCallback(async () => {
    if (!patientId || !repository) {
      setPatient(null);
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const loaded = await repository.getPatientById(patientId);
      if (requestId === requestIdRef.current) {
        setPatient(loaded);
        setIsLoading(false);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setHasLoadError(true);
        setIsLoading(false);
      }
    }
  }, [patientId, repository]);

  useEffect(() => {
    void loadPatient();
  }, [loadPatient]);

  const backLink = (
    <div>
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t('patients.detail.backToList')}</span>
      </Link>
    </div>
  );

  if (authStatus === 'loading' || isLoading) {
    return (
      <section className="space-y-6">
        {backLink}
        <LoadingState
          title={t('patients.detail.loadingTitle')}
          description={t('patients.detail.loadingDescription')}
        />
      </section>
    );
  }

  if (!clinic || !repository) {
    return (
      <section className="space-y-6">
        {backLink}
        <EmptyState
          title={t('patients.unconfiguredTitle')}
          description={t('patients.unconfiguredDescription')}
        />
      </section>
    );
  }

  if (hasLoadError) {
    return (
      <section className="space-y-6">
        {backLink}
        <ErrorState
          title={t('patients.errors.detailLoadTitle')}
          description={t('patients.errors.detailLoadDescription')}
          retryLabel={t('states.retry')}
          onRetry={() => void loadPatient()}
        />
      </section>
    );
  }

  if (!patient) {
    return (
      <section className="space-y-6">
        {backLink}
        <EmptyState
          title={t('patients.detail.notFoundTitle')}
          description={t('patients.detail.notFoundDescription')}
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/patients')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t('patients.detail.backToList')}</span>
            </Button>
          }
        />
      </section>
    );
  }

  const hasMedicalAlert = hasCriticalMedicalAlerts(patient.medicalAlerts);
  const ageYears = calculatePatientAge(patient.dateOfBirth);
  const formattedDob = formatCalendarDateForLocale(patient.dateOfBirth, locale);

  const handleUpdatePatient = async (input: PatientInput) => {
    const updated = await repository.updatePatient(patient.id, input);
    setPatient(updated);
    setIsEditing(false);
    setSaveSucceeded(true);
  };

  const handleConfirmArchive = async () => {
    if (isArchiving) {
      return;
    }

    setIsArchiving(true);
    setHasArchiveError(false);

    try {
      await repository.archivePatient(patient.id);
      navigate('/patients');
    } catch {
      setHasArchiveError(true);
      setIsArchiving(false);
    }
  };

  return (
    <section className="space-y-6">
      {backLink}

      {/* CRITICAL REQUIREMENT: MedicalAlertBanner ALWAYS sits at the top of the chart */}
      {hasMedicalAlert && patient.medicalAlerts ? (
        <MedicalAlertBanner
          label={t('patients.detail.medicalAlertBannerLabel')}
          title={patient.medicalAlerts}
          description={t('patients.detail.medicalAlertBannerHint')}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-card p-3.5">
          <Badge variant="success" className="shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('patients.detail.noMedicalAlertsBadge')}</span>
          </Badge>
          <p className="min-w-0 text-xs text-text-secondary break-words">
            {t('patients.detail.noMedicalAlertsDescription')}
          </p>
        </div>
      )}

      {saveSucceeded ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-lg border border-success-border bg-success-bg p-3.5 text-success-foreground"
        >
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-success"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 space-y-0.5 text-xs">
            <p className="font-semibold break-words">
              {t('patients.detail.savedBannerTitle')}
            </p>
            <p className="text-success-foreground/90 break-words">
              {t('patients.detail.savedBannerDescription')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h1 className="min-w-0 max-w-full text-xl sm:text-2xl font-bold tracking-tight text-text-primary break-words [overflow-wrap:anywhere]">
              {patient.fullName}
            </h1>
            {ageYears !== null ? (
              <Badge variant="primary" className="shrink-0">
                {t('patients.detail.ageYears').replace(
                  '{age}',
                  String(ageYears),
                )}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isEditing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isArchiving}
              onClick={() => {
                setSaveSucceeded(false);
                setIsConfirmingArchive(false);
                setIsEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              <span>{t('patients.detail.editButton')}</span>
            </Button>
          ) : null}

          {!isConfirmingArchive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-danger-border text-danger hover:bg-danger-bg hover:text-danger-foreground"
              disabled={isArchiving}
              onClick={() => {
                setSaveSucceeded(false);
                setIsEditing(false);
                setHasArchiveError(false);
                setIsConfirmingArchive(true);
              }}
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
              <span>{t('patients.detail.archiveButton')}</span>
            </Button>
          ) : null}
        </div>
      </div>

      {isConfirmingArchive ? (
        <PatientArchiveConfirmPanel
          isArchiving={isArchiving}
          hasError={hasArchiveError}
          onConfirm={() => void handleConfirmArchive()}
          onCancel={() => {
            setIsConfirmingArchive(false);
            setHasArchiveError(false);
          }}
        />
      ) : null}

      {isEditing ? (
        <PatientForm
          key={patient.updatedAt}
          mode="edit"
          initialValues={patient}
          onSubmit={handleUpdatePatient}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('patients.detail.contactCardTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-start gap-3 min-w-0">
                <Phone
                  className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t('patients.detail.phoneFieldLabel')}
                  </p>
                  <p className="text-text-primary break-words">
                    {patient.phone ?? t('patients.detail.notProvided')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 min-w-0">
                <Mail
                  className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t('patients.detail.emailFieldLabel')}
                  </p>
                  <p className="text-text-primary break-words">
                    {patient.email ?? t('patients.detail.notProvided')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 min-w-0">
                <Calendar
                  className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-text-muted">
                    {t('patients.detail.dateOfBirthFieldLabel')}
                  </p>
                  <p className="text-text-primary break-words">
                    {formattedDob
                      ? ageYears !== null
                        ? `${formattedDob} (${t('patients.detail.ageYears').replace('{age}', String(ageYears))})`
                        : formattedDob
                      : t('patients.detail.notProvided')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText
                  className="h-4 w-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                <span>{t('patients.detail.notesCardTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patient.generalNotes ? (
                <p className="whitespace-pre-line text-sm text-text-primary break-words">
                  {patient.generalNotes}
                </p>
              ) : (
                <p className="text-sm text-text-muted break-words">
                  {t('patients.detail.noGeneralNotes')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <PatientFilesSection
        clinicId={clinic.id}
        patientId={patient.id}
        patientFileRepository={patientFileRepository}
        imageOptimizer={imageOptimizer}
      />
    </section>
  );
}
