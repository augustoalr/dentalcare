import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Globe,
  Plus,
  X,
} from 'lucide-react';
import {
  APPOINTMENT_STATUSES,
  canEditClinicalNotes,
  extractClinicDateAndTime,
  findOverlappingAppointments,
  formatScheduleColumnHeader,
  formatScheduleDateLabel,
  getDateKeyInTimezone,
  getDateRangeUtcBounds,
  getWeekDateKeys,
  isAppointmentStatus,
  resolveSafeTimezone,
  shiftDateKey,
  summarizeDailyAppointments,
  type AppointmentCreateInput,
  type AppointmentRecord,
  type AppointmentStatus,
  type AppointmentStatusFilter,
  type ArchivedAppointmentRecord,
  type ClinicProvider,
} from '@/domain/appointments';
import type { PatientRecord } from '@/domain/patients';
import { useAuth } from '@/features/auth/AuthContext';
import { usePatientRepository } from '@/features/patients/PatientRepositoryContext';
import { AppointmentCard } from '@/features/schedule/AppointmentCard';
import { AppointmentForm } from '@/features/schedule/AppointmentForm';
import { useAppointmentRepository } from '@/features/schedule/AppointmentRepositoryContext';
import { ArchivedAppointmentCard } from '@/features/schedule/ArchivedAppointmentCard';
import { getAppointmentStatusLabelKey } from '@/features/schedule/scheduleI18n';
import { TodaySummaryPanel } from '@/features/schedule/TodaySummaryPanel';
import { useI18n, type TranslationKey } from '@/i18n';
import type { IAppointmentRepository } from '@/services/repositories/appointmentRepository';
import type { IPatientRepository } from '@/services/repositories/patientRepository';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import { Label } from '@/ui/components/ui/label';
import { Select } from '@/ui/components/ui/select';

export interface SchedulePageProps {
  readonly appointmentRepository?: IAppointmentRepository | null;
  readonly patientRepository?: IPatientRepository | null;
  readonly nowProvider?: () => Date;
}

type ScheduleTab = 'active' | 'archived';
type CalendarViewMode = 'day' | 'week';
type FeedbackKind =
  | 'none'
  | 'created'
  | 'updated'
  | 'status_updated'
  | 'notes_saved'
  | 'archived'
  | 'restored';

const FEEDBACK_KEYS: Readonly<
  Record<
    Exclude<FeedbackKind, 'none'>,
    { readonly title: TranslationKey; readonly description: TranslationKey }
  >
> = Object.freeze({
  created: {
    title: 'schedule.feedback.createdTitle',
    description: 'schedule.feedback.createdDescription',
  },
  updated: {
    title: 'schedule.feedback.updatedTitle',
    description: 'schedule.feedback.updatedDescription',
  },
  status_updated: {
    title: 'schedule.feedback.statusUpdatedTitle',
    description: 'schedule.feedback.statusUpdatedDescription',
  },
  notes_saved: {
    title: 'schedule.feedback.notesSavedTitle',
    description: 'schedule.feedback.notesSavedDescription',
  },
  archived: {
    title: 'schedule.feedback.archivedTitle',
    description: 'schedule.feedback.archivedDescription',
  },
  restored: {
    title: 'schedule.feedback.restoredTitle',
    description: 'schedule.feedback.restoredDescription',
  },
});

function sortAppointmentsAsc(
  list: readonly AppointmentRecord[],
): readonly AppointmentRecord[] {
  return Object.freeze(
    [...list].sort((left, right) => {
      const diff = Date.parse(left.startsAt) - Date.parse(right.startsAt);
      return diff !== 0 ? diff : left.id.localeCompare(right.id);
    }),
  );
}

function defaultNowProvider(): Date {
  return new Date();
}

export function SchedulePage({
  appointmentRepository,
  patientRepository,
  nowProvider = defaultNowProvider,
}: SchedulePageProps) {
  const { status: authStatus, clinic, profile } = useAuth();
  const { locale, t } = useI18n();
  const appointmentRepo = useAppointmentRepository(appointmentRepository);
  const patientRepo = usePatientRepository(patientRepository);

  const safeTimezone = resolveSafeTimezone(clinic?.timezone ?? 'UTC');
  const todayDateKey = getDateKeyInTimezone(nowProvider(), safeTimezone);
  const isAdmin = profile?.role === 'admin';
  const includeClinicalNotes = profile
    ? canEditClinicalNotes(profile.role)
    : false;

  const [activeTab, setActiveTab] = useState<ScheduleTab>('active');
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day');
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayDateKey);
  const [dentistFilter, setDentistFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] =
    useState<AppointmentStatusFilter>('all');

  const [providers, setProviders] = useState<readonly ClinicProvider[]>([]);
  const [patients, setPatients] = useState<readonly PatientRecord[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<
    readonly AppointmentRecord[]
  >([]);
  const [rangeAppointments, setRangeAppointments] = useState<
    readonly AppointmentRecord[]
  >([]);
  const [formDateAppointments, setFormDateAppointments] = useState<
    readonly AppointmentRecord[]
  >([]);

  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  const [archivedAppointments, setArchivedAppointments] = useState<
    readonly ArchivedAppointmentRecord[]
  >([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [hasArchivedLoadError, setHasArchivedLoadError] = useState(false);

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<AppointmentRecord | null>(null);
  const [feedback, setFeedback] = useState<FeedbackKind>('none');

  const scheduleRequestIdRef = useRef(0);
  const archivedRequestIdRef = useRef(0);
  const formDateRequestIdRef = useRef(0);

  const clinicId = clinic?.id ?? null;
  const effectiveTab: ScheduleTab = isAdmin ? activeTab : 'active';

  const visibleDateKeys = useMemo(
    () =>
      viewMode === 'week'
        ? getWeekDateKeys(selectedDateKey)
        : Object.freeze([selectedDateKey]),
    [selectedDateKey, viewMode],
  );

  const rangeStartKey = visibleDateKeys[0] ?? selectedDateKey;
  const rangeEndKey =
    visibleDateKeys[visibleDateKeys.length - 1] ?? selectedDateKey;

  const loadScheduleData = useCallback(async () => {
    if (!clinicId || !appointmentRepo || !patientRepo || !profile) {
      setIsLoadingSchedule(false);
      return;
    }

    const requestId = ++scheduleRequestIdRef.current;
    setIsLoadingSchedule(true);
    setHasLoadError(false);

    const viewRange = getDateRangeUtcBounds(
      rangeStartKey,
      rangeEndKey,
      safeTimezone,
    );
    const todayRange = getDateRangeUtcBounds(
      todayDateKey,
      todayDateKey,
      safeTimezone,
    );
    const isTodaySameAsView =
      rangeStartKey === todayDateKey && rangeEndKey === todayDateKey;

    try {
      const [loadedProviders, loadedPatients, loadedRange, loadedToday] =
        await Promise.all([
          appointmentRepo.listClinicProviders(clinicId),
          patientRepo.listPatients(clinicId),
          appointmentRepo.listAppointmentsByRange(clinicId, viewRange, {
            includeClinicalNotes,
          }),
          isTodaySameAsView
            ? Promise.resolve<readonly AppointmentRecord[] | null>(null)
            : appointmentRepo.listAppointmentsByRange(clinicId, todayRange, {
                includeClinicalNotes,
              }),
        ]);

      if (requestId === scheduleRequestIdRef.current) {
        setProviders(loadedProviders);
        setPatients(loadedPatients);
        setRangeAppointments(sortAppointmentsAsc(loadedRange));
        setTodayAppointments(
          sortAppointmentsAsc(loadedToday ?? loadedRange),
        );
        setIsLoadingSchedule(false);
      }
    } catch {
      if (requestId === scheduleRequestIdRef.current) {
        setHasLoadError(true);
        setIsLoadingSchedule(false);
      }
    }
  }, [
    appointmentRepo,
    clinicId,
    includeClinicalNotes,
    patientRepo,
    profile,
    rangeEndKey,
    rangeStartKey,
    safeTimezone,
    todayDateKey,
  ]);

  const loadArchivedAppointments = useCallback(async () => {
    if (!clinicId || !appointmentRepo || !isAdmin) {
      setArchivedAppointments([]);
      setIsLoadingArchived(false);
      return;
    }

    const requestId = ++archivedRequestIdRef.current;
    setIsLoadingArchived(true);
    setHasArchivedLoadError(false);

    try {
      const records = await appointmentRepo.listArchivedAppointments(clinicId, {
        includeClinicalNotes,
      });
      if (requestId === archivedRequestIdRef.current) {
        setArchivedAppointments(records);
        setIsLoadingArchived(false);
      }
    } catch {
      if (requestId === archivedRequestIdRef.current) {
        setHasArchivedLoadError(true);
        setIsLoadingArchived(false);
      }
    }
  }, [appointmentRepo, clinicId, includeClinicalNotes, isAdmin]);

  const handleFormDateKeyChange = useCallback(
    async (dateKey: string) => {
      if (!clinicId || !appointmentRepo) {
        return;
      }
      if (dateKey >= rangeStartKey && dateKey <= rangeEndKey) {
        return;
      }
      const requestId = ++formDateRequestIdRef.current;
      try {
        const bounds = getDateRangeUtcBounds(dateKey, dateKey, safeTimezone);
        const records = await appointmentRepo.listAppointmentsByRange(
          clinicId,
          bounds,
          { includeClinicalNotes },
        );
        if (requestId === formDateRequestIdRef.current) {
          setFormDateAppointments(records);
        }
      } catch {
        // Non-blocking: existing loaded appointments still participate in overlap checks
      }
    },
    [
      appointmentRepo,
      clinicId,
      includeClinicalNotes,
      rangeEndKey,
      rangeStartKey,
      safeTimezone,
    ],
  );

  useEffect(() => {
    void loadScheduleData();
  }, [loadScheduleData]);

  useEffect(() => {
    if (effectiveTab === 'archived' && isAdmin) {
      void loadArchivedAppointments();
    }
  }, [effectiveTab, isAdmin, loadArchivedAppointments]);

  const patientsById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  const knownActiveAppointments = useMemo(() => {
    const byId = new Map<string, AppointmentRecord>();
    for (const item of todayAppointments) {
      byId.set(item.id, item);
    }
    for (const item of rangeAppointments) {
      byId.set(item.id, item);
    }
    for (const item of formDateAppointments) {
      byId.set(item.id, item);
    }
    return sortAppointmentsAsc(Array.from(byId.values()));
  }, [formDateAppointments, rangeAppointments, todayAppointments]);

  const todaySummary = useMemo(
    () =>
      summarizeDailyAppointments(
        todayAppointments,
        nowProvider().toISOString(),
      ),
    [nowProvider, todayAppointments],
  );

  const overlappingAppointmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const appointment of rangeAppointments) {
      if (
        appointment.status === 'cancelled' ||
        appointment.status === 'no_show'
      ) {
        continue;
      }
      const matches = findOverlappingAppointments(
        {
          dentistId: appointment.dentistId,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          excludeAppointmentId: appointment.id,
        },
        rangeAppointments,
      );
      if (matches.length > 0) {
        ids.add(appointment.id);
      }
    }
    return ids;
  }, [rangeAppointments]);

  const filteredAppointments = useMemo(
    () =>
      rangeAppointments.filter((item) => {
        if (dentistFilter !== 'all' && item.dentistId !== dentistFilter) {
          return false;
        }
        if (statusFilter !== 'all' && item.status !== statusFilter) {
          return false;
        }
        return true;
      }),
    [dentistFilter, rangeAppointments, statusFilter],
  );

  const appointmentsByDateKey = useMemo(() => {
    const grouped = new Map<string, AppointmentRecord[]>();
    for (const dateKey of visibleDateKeys) {
      grouped.set(dateKey, []);
    }
    for (const item of filteredAppointments) {
      const extracted = extractClinicDateAndTime(item.startsAt, safeTimezone);
      const bucketKey = extracted?.dateKey ?? rangeStartKey;
      const list = grouped.get(bucketKey);
      if (list) {
        list.push(item);
      }
    }
    return grouped;
  }, [filteredAppointments, rangeStartKey, safeTimezone, visibleDateKeys]);

  // B-05: Always render H1 `sections.schedule.title` across loading, degraded, and normal states
  const pageHeader = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary break-words">
            {t('sections.schedule.title')}
          </h1>
          {clinic ? (
            <Badge variant="default" className="shrink-0">
              <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {t('schedule.timezoneBadge').replace(
                  '{timezone}',
                  safeTimezone,
                )}
              </span>
            </Badge>
          ) : null}
        </div>
        <p className="max-w-3xl text-sm text-text-secondary break-words">
          {t('sections.schedule.description')}
        </p>
      </div>

      {clinic &&
      profile &&
      appointmentRepo &&
      patientRepo &&
      effectiveTab === 'active' ? (
        <Button
          type="button"
          variant={isCreateFormOpen ? 'outline' : 'default'}
          className="self-start shrink-0"
          onClick={() => {
            setEditingAppointment(null);
            setIsCreateFormOpen((prev) => !prev);
          }}
        >
          {isCreateFormOpen ? (
            <>
              <X className="h-4 w-4" aria-hidden="true" />
              <span>{t('schedule.closeFormButton')}</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t('schedule.newAppointmentButton')}</span>
            </>
          )}
        </Button>
      ) : null}
    </div>
  );

  if (authStatus === 'loading') {
    return (
      <section className="space-y-6">
        {pageHeader}
        <LoadingState
          title={t('states.loadingTitle')}
          description={t('states.loadingDescription')}
        />
      </section>
    );
  }

  if (!clinic || !profile || !appointmentRepo || !patientRepo) {
    return (
      <section className="space-y-6">
        {pageHeader}
        <EmptyState
          title={t('schedule.unconfiguredTitle')}
          description={t('schedule.unconfiguredDescription')}
        />
      </section>
    );
  }

  const handleCreateAppointment = async (input: AppointmentCreateInput) => {
    await appointmentRepo.createAppointment(clinic.id, input, {
      includeClinicalNotes,
    });
    setIsCreateFormOpen(false);
    setEditingAppointment(null);
    setFeedback('created');
    await loadScheduleData();
  };

  const handleUpdateAppointment = async (input: AppointmentCreateInput) => {
    if (!editingAppointment) {
      return;
    }

    await appointmentRepo.updateAppointment(
      editingAppointment.id,
      {
        dentistId: input.dentistId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        reason: input.reason,
        ...(includeClinicalNotes && input.clinicalNotes !== undefined
          ? { clinicalNotes: input.clinicalNotes }
          : {}),
      },
      { includeClinicalNotes },
    );
    setEditingAppointment(null);
    setFeedback('updated');
    await loadScheduleData();
  };

  const handleStatusChange = async (
    appointmentId: string,
    nextStatus: AppointmentStatus,
  ) => {
    const updated = await appointmentRepo.updateAppointmentStatus(
      appointmentId,
      nextStatus,
      { includeClinicalNotes },
    );
    setRangeAppointments((prev) =>
      sortAppointmentsAsc(
        prev.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    setTodayAppointments((prev) =>
      sortAppointmentsAsc(
        prev.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    setFeedback('status_updated');
  };

  const handleSaveClinicalNotes = async (
    appointmentId: string,
    notes: string | null,
  ) => {
    if (!includeClinicalNotes) {
      return;
    }
    const updated = await appointmentRepo.updateClinicalNotes(
      appointmentId,
      notes,
    );
    setRangeAppointments((prev) =>
      sortAppointmentsAsc(
        prev.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    setTodayAppointments((prev) =>
      sortAppointmentsAsc(
        prev.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    setFeedback('notes_saved');
  };

  const handleArchiveAppointment = async (appointment: AppointmentRecord) => {
    await appointmentRepo.archiveAppointment(appointment.id);
    setRangeAppointments((prev) =>
      Object.freeze(prev.filter((item) => item.id !== appointment.id)),
    );
    setTodayAppointments((prev) =>
      Object.freeze(prev.filter((item) => item.id !== appointment.id)),
    );
    if (editingAppointment?.id === appointment.id) {
      setEditingAppointment(null);
    }
    setFeedback('archived');
  };

  const handleRestoreAppointment = async (
    archived: ArchivedAppointmentRecord,
  ) => {
    await appointmentRepo.restoreAppointment(archived.id);
    setArchivedAppointments((prev) =>
      Object.freeze(prev.filter((item) => item.id !== archived.id)),
    );
    setFeedback('restored');
    await loadScheduleData();
  };

  const hasActiveFilters = dentistFilter !== 'all' || statusFilter !== 'all';
  const navigationStepDays = viewMode === 'week' ? 7 : 1;
  const visibleRangeLabel =
    viewMode === 'week'
      ? `${formatScheduleDateLabel(rangeStartKey, locale)} — ${formatScheduleDateLabel(rangeEndKey, locale)}`
      : formatScheduleDateLabel(selectedDateKey, locale);

  const feedbackCopy = feedback !== 'none' ? FEEDBACK_KEYS[feedback] : null;

  return (
    <section className="space-y-6">
      {pageHeader}

      {isAdmin ? (
        <div
          role="tablist"
          aria-label={t('schedule.tabs.ariaLabel')}
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
            {t('schedule.tabs.active')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'archived'}
            onClick={() => {
              setIsCreateFormOpen(false);
              setEditingAppointment(null);
              setActiveTab('archived');
            }}
            className={
              effectiveTab === 'archived'
                ? 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface-card px-3 text-xs font-semibold text-text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('schedule.tabs.archived')}</span>
          </button>
        </div>
      ) : null}

      {feedbackCopy ? (
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
              {t(feedbackCopy.title)}
            </p>
            <p className="text-success-foreground/90 break-words">
              {t(feedbackCopy.description)}
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
            title={t('schedule.archived.loadErrorTitle')}
            description={t('schedule.archived.loadErrorDescription')}
            retryLabel={t('states.retry')}
            onRetry={() => void loadArchivedAppointments()}
          />
        ) : archivedAppointments.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" aria-hidden="true" />}
            title={t('schedule.archived.emptyTitle')}
            description={t('schedule.archived.emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            {archivedAppointments.map((appointment) => (
              <ArchivedAppointmentCard
                key={appointment.id}
                appointment={appointment}
                patient={patientsById.get(appointment.patientId)}
                provider={providersById.get(appointment.dentistId)}
                timezone={safeTimezone}
                onRestore={handleRestoreAppointment}
              />
            ))}
          </div>
        )
      ) : isLoadingSchedule ? (
        <LoadingState
          title={t('states.loadingTitle')}
          description={t('states.loadingDescription')}
        />
      ) : hasLoadError ? (
        <ErrorState
          title={t('schedule.errors.loadTitle')}
          description={t('schedule.errors.loadDescription')}
          retryLabel={t('states.retry')}
          onRetry={() => void loadScheduleData()}
        />
      ) : (
        <div className="space-y-6">
          {/* M-03: Always anchored to today's date in clinic.timezone */}
          <TodaySummaryPanel
            todayDateKey={todayDateKey}
            timezone={safeTimezone}
            summary={todaySummary}
            patientsById={patientsById}
            providersById={providersById}
          />

          {isCreateFormOpen ? (
            <AppointmentForm
              key={`create-${selectedDateKey}`}
              mode="create"
              timezone={safeTimezone}
              role={profile.role}
              defaultDateKey={selectedDateKey}
              patients={patients}
              providers={providers}
              existingAppointments={knownActiveAppointments}
              onDateKeyChange={(dk) => void handleFormDateKeyChange(dk)}
              onSubmit={handleCreateAppointment}
              onCancel={() => setIsCreateFormOpen(false)}
            />
          ) : null}

          {editingAppointment ? (
            <AppointmentForm
              key={editingAppointment.id}
              mode="edit"
              timezone={safeTimezone}
              role={profile.role}
              defaultDateKey={selectedDateKey}
              patients={patients}
              providers={providers}
              existingAppointments={knownActiveAppointments}
              initialAppointment={editingAppointment}
              onDateKeyChange={(dk) => void handleFormDateKeyChange(dk)}
              onSubmit={handleUpdateAppointment}
              onCancel={() => setEditingAppointment(null)}
            />
          ) : null}

          {/* Controls bar: Day/Week toggle, Date Navigation, Dentist & Status filters */}
          <div className="space-y-4 rounded-lg border border-border bg-surface-card p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label={t('schedule.controls.viewAriaLabel')}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted p-1"
                >
                  <button
                    type="button"
                    aria-pressed={viewMode === 'day'}
                    onClick={() => setViewMode('day')}
                    className={
                      viewMode === 'day'
                        ? 'inline-flex h-7 items-center rounded px-2.5 text-xs font-semibold bg-surface-card text-text-primary shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        : 'inline-flex h-7 items-center rounded px-2.5 text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    }
                  >
                    {t('schedule.controls.dayView')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === 'week'}
                    onClick={() => setViewMode('week')}
                    className={
                      viewMode === 'week'
                        ? 'inline-flex h-7 items-center rounded px-2.5 text-xs font-semibold bg-surface-card text-text-primary shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                        : 'inline-flex h-7 items-center rounded px-2.5 text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    }
                  >
                    {t('schedule.controls.weekView')}
                  </button>
                </div>

                <div className="inline-flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedDateKey((prev) =>
                        shiftDateKey(prev, -navigationStepDays),
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span>{t('schedule.controls.previous')}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedDateKey(todayDateKey)}
                  >
                    {t('schedule.controls.today')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedDateKey((prev) =>
                        shiftDateKey(prev, navigationStepDays),
                      )
                    }
                  >
                    <span>{t('schedule.controls.next')}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <p className="text-sm font-semibold text-text-primary break-words">
                {visibleRangeLabel}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="schedule-dentist-filter">
                  {t('schedule.controls.dentistFilterLabel')}
                </Label>
                <Select
                  id="schedule-dentist-filter"
                  value={dentistFilter}
                  onChange={(e) => setDentistFilter(e.target.value)}
                >
                  <option value="all">
                    {t('schedule.controls.allDentists')}
                  </option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.fullName}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="schedule-status-filter">
                  {t('schedule.controls.statusFilterLabel')}
                </Label>
                <Select
                  id="schedule-status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'all' || isAppointmentStatus(value)) {
                      setStatusFilter(value);
                    }
                  }}
                >
                  <option value="all">{t('schedule.statuses.all')}</option>
                  {APPOINTMENT_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {t(getAppointmentStatusLabelKey(item))}
                    </option>
                  ))}
                </Select>
              </div>

              {hasActiveFilters ? (
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDentistFilter('all');
                      setStatusFilter('all');
                    }}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    <span>{t('schedule.controls.clearFilters')}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {filteredAppointments.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-5 w-5" aria-hidden="true" />}
              title={
                hasActiveFilters
                  ? t('schedule.empty.filteredTitle')
                  : viewMode === 'week'
                    ? t('schedule.empty.weekTitle')
                    : t('schedule.empty.dayTitle')
              }
              description={
                hasActiveFilters
                  ? t('schedule.empty.filteredDescription')
                  : viewMode === 'week'
                    ? t('schedule.empty.weekDescription')
                    : t('schedule.empty.dayDescription')
              }
              action={
                hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDentistFilter('all');
                      setStatusFilter('all');
                    }}
                  >
                    {t('schedule.controls.clearFilters')}
                  </Button>
                ) : !isCreateFormOpen ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingAppointment(null);
                      setIsCreateFormOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{t('schedule.newAppointmentButton')}</span>
                  </Button>
                ) : undefined
              }
            />
          ) : viewMode === 'day' ? (
            <div className="space-y-3">
              {filteredAppointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  patient={patientsById.get(appointment.patientId)}
                  provider={providersById.get(appointment.dentistId)}
                  timezone={safeTimezone}
                  role={profile.role}
                  hasOverlap={overlappingAppointmentIds.has(appointment.id)}
                  onStatusChange={handleStatusChange}
                  onSaveClinicalNotes={
                    includeClinicalNotes ? handleSaveClinicalNotes : undefined
                  }
                  onEdit={(selected) => {
                    setIsCreateFormOpen(false);
                    setEditingAppointment(selected);
                  }}
                  onArchive={handleArchiveAppointment}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
              {visibleDateKeys.map((dateKey) => {
                const dayItems = appointmentsByDateKey.get(dateKey) ?? [];
                const isTodayColumn = dateKey === todayDateKey;
                return (
                  <div
                    key={dateKey}
                    className={
                      isTodayColumn
                        ? 'space-y-2.5 rounded-lg border-2 border-primary/40 bg-surface-muted/40 p-3'
                        : 'space-y-2.5 rounded-lg border border-border bg-surface-muted/30 p-3'
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-primary break-words">
                        {formatScheduleColumnHeader(dateKey, locale)}
                      </h2>
                      <Badge variant={isTodayColumn ? 'primary' : 'default'}>
                        {dayItems.length}
                      </Badge>
                    </div>

                    {dayItems.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border bg-surface-card/60 px-2.5 py-4 text-center text-xs text-text-muted">
                        {t('schedule.empty.weekDayEmpty')}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {dayItems.map((appointment) => (
                          <AppointmentCard
                            key={appointment.id}
                            appointment={appointment}
                            patient={patientsById.get(appointment.patientId)}
                            provider={providersById.get(appointment.dentistId)}
                            timezone={safeTimezone}
                            role={profile.role}
                            hasOverlap={overlappingAppointmentIds.has(
                              appointment.id,
                            )}
                            compact
                            onStatusChange={handleStatusChange}
                            onSaveClinicalNotes={
                              includeClinicalNotes
                                ? handleSaveClinicalNotes
                                : undefined
                            }
                            onEdit={(selected) => {
                              setIsCreateFormOpen(false);
                              setEditingAppointment(selected);
                            }}
                            onArchive={handleArchiveAppointment}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
