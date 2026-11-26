import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, Users, X } from 'lucide-react';
import {
  filterPatientsByQuery,
  type PatientInput,
  type PatientRecord,
} from '@/domain/patients';
import { useAuth } from '@/features/auth/AuthContext';
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
  const { status: authStatus, clinic } = useAuth();
  const { t } = useI18n();
  const repository = usePatientRepository(patientRepository);

  const [patients, setPatients] = useState<readonly PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);

  const requestIdRef = useRef(0);
  const clinicId = clinic?.id ?? null;

  const loadPatients = useCallback(async () => {
    if (!clinicId || !repository) {
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const records = await repository.listPatients(clinicId);
      if (requestId === requestIdRef.current) {
        setPatients(records);
        setIsLoading(false);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setHasLoadError(true);
        setIsLoading(false);
      }
    }
  }, [clinicId, repository]);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

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
  };

  const countBadgeText =
    patients.length === 1
      ? t('patients.countSingle')
      : t('patients.countPlural').replace('{count}', String(patients.length));

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
            {!isLoading && !hasLoadError ? (
              <Badge variant="primary">{countBadgeText}</Badge>
            ) : null}
          </div>
          <p className="max-w-3xl text-sm text-text-secondary break-words">
            {t('patients.description')}
          </p>
        </div>

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
      </div>

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
    </section>
  );
}
