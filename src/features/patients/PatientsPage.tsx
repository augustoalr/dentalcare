import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarPlus,
  CheckCircle2,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  filterPatientsByQuery,
  type ArchivedPatientRecord,
  type PatientInput,
  type PatientRecord,
} from '@/domain/patients';
import { useAuth } from '@/features/auth/AuthContext';
import { ArchivedPatientCard } from '@/features/patients/ArchivedPatientCard';
import { PatientForm } from '@/features/patients/PatientForm';
import { PatientListCard } from '@/features/patients/PatientListCard';
import { usePatientRepository } from '@/features/patients/PatientRepositoryContext';
import { useI18n } from '@/i18n';
import type { IPatientRepository } from '@/services/repositories/patientRepository';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';

export interface PatientsPageProps {
  readonly patientRepository?: IPatientRepository | null;
}

type PatientsTab = 'active' | 'archived';

function sortPatientsByName(
  list: readonly PatientRecord[],
): readonly PatientRecord[] {
  return Object.freeze(
    [...list].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, undefined, {
        sensitivity: 'base',
      }),
    ),
  );
}

export function PatientsPage({ patientRepository }: PatientsPageProps) {
  const { status: authStatus, clinic, profile } = useAuth();
  const { t } = useI18n();
  const repository = usePatientRepository(patientRepository);

  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<PatientsTab>('active');
  const [patients, setPatients] = useState<readonly PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  const [archivedPatients, setArchivedPatients] = useState<
    readonly ArchivedPatientRecord[]
  >([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [hasArchivedLoadError, setHasArchivedLoadError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [lastCreatedPatient, setLastCreatedPatient] =
    useState<PatientRecord | null>(null);
  const [restoreSucceeded, setRestoreSucceeded] = useState(false);

  const activeRequestIdRef = useRef(0);
  const archivedRequestIdRef = useRef(0);
  const clinicId = clinic?.id ?? null;

  const effectiveTab: PatientsTab = isAdmin ? activeTab : 'active';

  const loadPatients = useCallback(async () => {
    if (!clinicId || !repository) {
      setIsLoading(false);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const records = await repository.listPatients(clinicId);
      if (requestId === activeRequestIdRef.current) {
        setPatients(records);
        setIsLoading(false);
      }
    } catch {
      if (requestId === activeRequestIdRef.current) {
        setHasLoadError(true);
        setIsLoading(false);
      }
    }
  }, [clinicId, repository]);

  const loadArchivedPatients = useCallback(async () => {
    if (!clinicId || !repository || !isAdmin) {
      setArchivedPatients([]);
      setIsLoadingArchived(false);
      return;
    }

    const requestId = ++archivedRequestIdRef.current;
    setIsLoadingArchived(true);
    setHasArchivedLoadError(false);

    try {
      const records = await repository.listArchivedPatients(clinicId);
      if (requestId === archivedRequestIdRef.current) {
        setArchivedPatients(records);
        setIsLoadingArchived(false);
      }
    } catch {
      if (requestId === archivedRequestIdRef.current) {
        setHasArchivedLoadError(true);
        setIsLoadingArchived(false);
      }
    }
  }, [clinicId, isAdmin, repository]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (effectiveTab === 'archived' && isAdmin) {
      void loadArchivedPatients();
    }
  }, [effectiveTab, isAdmin, loadArchivedPatients]);

  const filteredPatients = useMemo(
    () => filterPatientsByQuery(patients, searchQuery),
    [patients, searchQuery],
  );

  if (authStatus === 'loading') {
    return (
      <LoadingState
        title={t('states.loadingTitle')}
        description={t('states.loadingDescription')}
      />
    );
  }

  if (!clinic || !repository) {
    return (
      <section className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary break-words">
            {t('patients.title')}
          </h1>
          <p className="max-w-3xl text-sm text-text-secondary break-words">
            {t('patients.description')}
          </p>
        </div>
        <EmptyState
          title={t('patients.unconfiguredTitle')}
          description={t('patients.unconfiguredDescription')}
        />
      </section>
    );
  }

  const handleCreatePatient = async (input: PatientInput) => {
    const created = await repository.createPatient(clinic.id, input);
    setPatients((prev) => sortPatientsByName([...prev, created]));
    setSearchQuery('');
    setIsCreateFormOpen(false);
    setRestoreSucceeded(false);
    setLastCreatedPatient(created);
  };

  const handleRestorePatient = async (archived: ArchivedPatientRecord) => {
    await repository.restorePatient(archived.id);
    setArchivedPatients((prev) =>
      Object.freeze(prev.filter((item) => item.id !== archived.id)),
    );
    const restoredRecord: PatientRecord = Object.freeze({
      id: archived.id,
      clinicId: archived.clinicId,
      fullName: archived.fullName,
      phone: archived.phone,
      email: archived.email,
      dateOfBirth: archived.dateOfBirth,
      medicalAlerts: archived.medicalAlerts,
      generalNotes: archived.generalNotes,
      createdAt: archived.createdAt,
      updatedAt: archived.updatedAt,
    });
    setPatients((prev) =>
      sortPatientsByName([
        ...prev.filter((item) => item.id !== restoredRecord.id),
        restoredRecord,
      ]),
    );
    setLastCreatedPatient(null);
    setRestoreSucceeded(true);
  };

  const activeCountBadgeText =
    patients.length === 1
      ? t('patients.countSingle')
      : t('patients.countPlural').replace('{count}', String(patients.length));

  const archivedCountBadgeText =
    archivedPatients.length === 1
      ? t('patients.archived.countSingle')
      : t('patients.archived.countPlural').replace(
          '{count}',
          String(archivedPatients.length),
        );

  const searchCountText = t('patients.search.resultsCount')
    .replace('{shown}', String(filteredPatients.length))
    .replace('{total}', String(patients.length));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary break-words">
              {t('patients.title')}
            </h1>
            {effectiveTab === 'active' && !isLoading && !hasLoadError ? (
              <Badge variant="primary">{activeCountBadgeText}</Badge>
            ) : null}
            {effectiveTab === 'archived' &&
            !isLoadingArchived &&
            !hasArchivedLoadError ? (
              <Badge variant="default">{archivedCountBadgeText}</Badge>
            ) : null}
          </div>
          <p className="max-w-3xl text-sm text-text-secondary break-words">
            {t('patients.description')}
          </p>
        </div>

        {effectiveTab === 'active' ? (
          <Button
            type="button"
            variant={isCreateFormOpen ? 'outline' : 'default'}
            onClick={() => setIsCreateFormOpen((prev) => !prev)}
          >
            {isCreateFormOpen ? (
              <>
                <X className="h-4 w-4" aria-hidden="true" />
                <span>{t('patients.closeFormButton')}</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>{t('patients.newPatientButton')}</span>
              </>
            )}
          </Button>
        ) : null}
      </div>

      {isAdmin ? (
        <div
          role="tablist"
          aria-label={t('patients.tabs.ariaLabel')}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'active'}
            onClick={() => setActiveTab('active')}
            className={
              effectiveTab === 'active'
                ? 'inline-flex h-8 items-center justify-center rounded-md bg-surface-card px-3 text-xs font-semibold text-text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            {t('patients.tabs.active')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'archived'}
            onClick={() => {
              setIsCreateFormOpen(false);
              setActiveTab('archived');
            }}
            className={
              effectiveTab === 'archived'
                ? 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface-card px-3 text-xs font-semibold text-text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('patients.tabs.archived')}</span>
          </button>
        </div>
      ) : null}

      {lastCreatedPatient ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-lg border border-success-border bg-success-bg p-4 text-success-foreground sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-success"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <p className="font-semibold break-words">
                {t('patients.createdBanner.title')}
              </p>
              <p className="text-success-foreground/90 break-words [overflow-wrap:anywhere]">
                {t('patients.createdBanner.description').replace(
                  '{name}',
                  lastCreatedPatient.fullName,
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <Link
                  to={`/schedule?newAppointment=1&patientId=${encodeURIComponent(lastCreatedPatient.id)}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <CalendarPlus
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{t('patients.quickScheduleButton')}</span>
                </Link>
                <Link
                  to={`/patients/${lastCreatedPatient.id}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-success-border bg-surface-card px-3 text-xs font-medium text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span>{t('patients.createdBanner.viewChartLink')}</span>
                </Link>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('patients.createdBanner.dismissAria')}
            className="h-8 w-8 self-end p-0 text-success-foreground hover:bg-success/10 hover:text-success-foreground sm:self-start"
            onClick={() => setLastCreatedPatient(null)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      {restoreSucceeded ? (
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
              {t('patients.archived.restoreSuccessTitle')}
            </p>
            <p className="text-success-foreground/90 break-words">
              {t('patients.archived.restoreSuccessDescription')}
            </p>
          </div>
        </div>
      ) : null}

      {effectiveTab === 'archived' ? (
        isLoadingArchived ? (
          <LoadingState
            title={t('states.loadingTitle')}
            description={t('states.loadingDescription')}
          />
        ) : hasArchivedLoadError ? (
          <ErrorState
            title={t('patients.archived.loadErrorTitle')}
            description={t('patients.archived.loadErrorDescription')}
            retryLabel={t('states.retry')}
            onRetry={() => void loadArchivedPatients()}
          />
        ) : archivedPatients.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" aria-hidden="true" />}
            title={t('patients.archived.emptyTitle')}
            description={t('patients.archived.emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            {archivedPatients.map((patient) => (
              <ArchivedPatientCard
                key={patient.id}
                patient={patient}
                onRestore={handleRestorePatient}
              />
            ))}
          </div>
        )
      ) : (
        <>
          {isCreateFormOpen ? (
            <PatientForm
              mode="create"
              onSubmit={handleCreatePatient}
              onCancel={() => setIsCreateFormOpen(false)}
            />
          ) : null}

          {isLoading ? (
            <LoadingState
              title={t('states.loadingTitle')}
              description={t('states.loadingDescription')}
            />
          ) : hasLoadError ? (
            <ErrorState
              title={t('patients.errors.listLoadTitle')}
              description={t('patients.errors.listLoadDescription')}
              retryLabel={t('states.retry')}
              onRetry={() => void loadPatients()}
            />
          ) : patients.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              title={t('patients.empty.noPatientsTitle')}
              description={t('patients.empty.noPatientsDescription')}
              action={
                !isCreateFormOpen ? (
                  <Button
                    type="button"
                    onClick={() => setIsCreateFormOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    <span>{t('patients.newPatientButton')}</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="patients-search-input">
                    {t('patients.search.label')}
                  </Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                      aria-hidden="true"
                    />
                    <Input
                      id="patients-search-input"
                      type="search"
                      value={searchQuery}
                      placeholder={t('patients.search.placeholder')}
                      className="pl-9"
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {searchQuery.trim().length > 0 ? (
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs text-text-muted">
                      {searchCountText}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span>{t('patients.search.clearButton')}</span>
                    </Button>
                  </div>
                ) : null}
              </div>

              {filteredPatients.length === 0 ? (
                <EmptyState
                  icon={<Search className="h-5 w-5" aria-hidden="true" />}
                  title={t('patients.empty.noSearchResultsTitle')}
                  description={t('patients.empty.noSearchResultsDescription')}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSearchQuery('')}
                    >
                      {t('patients.search.clearButton')}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredPatients.map((patient) => (
                    <PatientListCard key={patient.id} patient={patient} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
