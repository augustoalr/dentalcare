import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Lock,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  filterTreatments,
  isTreatmentCategory,
  TREATMENT_CATEGORIES,
  type ArchivedTreatmentRecord,
  type TreatmentCategoryFilter,
  type TreatmentInput,
  type TreatmentRecord,
} from '@/domain/treatments';
import { useAuth } from '@/features/auth/AuthContext';
import { ArchivedTreatmentCard } from '@/features/treatments/ArchivedTreatmentCard';
import { TreatmentCard } from '@/features/treatments/TreatmentCard';
import { TreatmentForm } from '@/features/treatments/TreatmentForm';
import { getTreatmentCategoryLabelKey } from '@/features/treatments/treatmentI18n';
import { useTreatmentRepository } from '@/features/treatments/TreatmentRepositoryContext';
import { useI18n, type TranslationKey } from '@/i18n';
import type { ITreatmentRepository } from '@/services/repositories/treatmentRepository';
import { EmptyState } from '@/ui/components/states/EmptyState';
import { ErrorState } from '@/ui/components/states/ErrorState';
import { LoadingState } from '@/ui/components/states/LoadingState';
import { Badge } from '@/ui/components/ui/badge';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Select } from '@/ui/components/ui/select';

export interface TreatmentsPageProps {
  readonly treatmentRepository?: ITreatmentRepository | null;
}

type TreatmentsTab = 'active' | 'archived';
type FeedbackKind = 'none' | 'created' | 'updated' | 'archived' | 'restored';

function sortTreatments(
  list: readonly TreatmentRecord[],
): readonly TreatmentRecord[] {
  return Object.freeze(
    [...list].sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category);
      if (categoryCompare !== 0) {
        return categoryCompare;
      }
      return left.nameEn.localeCompare(right.nameEn, undefined, {
        sensitivity: 'base',
      });
    }),
  );
}

const FEEDBACK_COPY_KEYS: Readonly<
  Record<
    Exclude<FeedbackKind, 'none'>,
    { readonly title: TranslationKey; readonly description: TranslationKey }
  >
> = Object.freeze({
  created: {
    title: 'treatments.feedback.createdTitle',
    description: 'treatments.feedback.createdDescription',
  },
  updated: {
    title: 'treatments.feedback.updatedTitle',
    description: 'treatments.feedback.updatedDescription',
  },
  archived: {
    title: 'treatments.feedback.archivedTitle',
    description: 'treatments.feedback.archivedDescription',
  },
  restored: {
    title: 'treatments.feedback.restoredTitle',
    description: 'treatments.feedback.restoredDescription',
  },
});

export function TreatmentsPage({ treatmentRepository }: TreatmentsPageProps) {
  const { status: authStatus, clinic, profile } = useAuth();
  const { t } = useI18n();
  const repository = useTreatmentRepository(treatmentRepository);

  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<TreatmentsTab>('active');
  const [treatments, setTreatments] = useState<readonly TreatmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  const [archivedTreatments, setArchivedTreatments] = useState<
    readonly ArchivedTreatmentRecord[]
  >([]);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [hasArchivedLoadError, setHasArchivedLoadError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] =
    useState<TreatmentCategoryFilter>('all');
  const [includeInactive, setIncludeInactive] = useState(true);

  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] =
    useState<TreatmentRecord | null>(null);
  const [feedback, setFeedback] = useState<FeedbackKind>('none');

  const activeRequestIdRef = useRef(0);
  const archivedRequestIdRef = useRef(0);
  const clinicId = clinic?.id ?? null;

  const effectiveTab: TreatmentsTab = isAdmin ? activeTab : 'active';

  const loadTreatments = useCallback(async () => {
    if (!clinicId || !repository) {
      setIsLoading(false);
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const records = await repository.listTreatments(clinicId);
      if (requestId === activeRequestIdRef.current) {
        setTreatments(records);
        setIsLoading(false);
      }
    } catch {
      if (requestId === activeRequestIdRef.current) {
        setHasLoadError(true);
        setIsLoading(false);
      }
    }
  }, [clinicId, repository]);

  const loadArchivedTreatments = useCallback(async () => {
    if (!clinicId || !repository || !isAdmin) {
      setArchivedTreatments([]);
      setIsLoadingArchived(false);
      return;
    }

    const requestId = ++archivedRequestIdRef.current;
    setIsLoadingArchived(true);
    setHasArchivedLoadError(false);

    try {
      const records = await repository.listArchivedTreatments(clinicId);
      if (requestId === archivedRequestIdRef.current) {
        setArchivedTreatments(records);
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
    void loadTreatments();
  }, [loadTreatments]);

  useEffect(() => {
    if (effectiveTab === 'archived' && isAdmin) {
      void loadArchivedTreatments();
    }
  }, [effectiveTab, isAdmin, loadArchivedTreatments]);

  const filteredTreatments = useMemo(
    () =>
      filterTreatments(treatments, {
        query: searchQuery,
        category: categoryFilter,
        includeInactive,
      }),
    [treatments, searchQuery, categoryFilter, includeInactive],
  );

  const pausedCount = useMemo(
    () => treatments.filter((item) => !item.isActive).length,
    [treatments],
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
            {t('treatments.title')}
          </h1>
          <p className="max-w-3xl text-sm text-text-secondary break-words">
            {t('treatments.description')}
          </p>
        </div>
        <EmptyState
          title={t('treatments.unconfiguredTitle')}
          description={t('treatments.unconfiguredDescription')}
        />
      </section>
    );
  }

  const handleCreateTreatment = async (input: TreatmentInput) => {
    const created = await repository.createTreatment(clinic.id, input);
    setTreatments((prev) => sortTreatments([...prev, created]));
    setSearchQuery('');
    setCategoryFilter('all');
    if (!created.isActive) {
      setIncludeInactive(true);
    }
    setIsCreateFormOpen(false);
    setEditingTreatment(null);
    setFeedback('created');
  };

  const handleUpdateTreatment = async (input: TreatmentInput) => {
    if (!editingTreatment) {
      return;
    }

    const updated = await repository.updateTreatment(editingTreatment.id, input);
    setTreatments((prev) =>
      sortTreatments(
        prev.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
    if (!updated.isActive) {
      setIncludeInactive(true);
    }
    setEditingTreatment(null);
    setFeedback('updated');
  };

  const handleArchiveTreatment = async (treatment: TreatmentRecord) => {
    await repository.archiveTreatment(treatment.id);
    setTreatments((prev) =>
      Object.freeze(prev.filter((item) => item.id !== treatment.id)),
    );
    if (editingTreatment?.id === treatment.id) {
      setEditingTreatment(null);
    }
    setFeedback('archived');
  };

  const handleRestoreTreatment = async (archived: ArchivedTreatmentRecord) => {
    await repository.restoreTreatment(archived.id);
    setArchivedTreatments((prev) =>
      Object.freeze(prev.filter((item) => item.id !== archived.id)),
    );
    const restoredRecord: TreatmentRecord = Object.freeze({
      id: archived.id,
      clinicId: archived.clinicId,
      code: archived.code,
      nameEn: archived.nameEn,
      nameEs: archived.nameEs,
      category: archived.category,
      defaultPriceCents: archived.defaultPriceCents,
      defaultDurationMin: archived.defaultDurationMin,
      isActive: archived.isActive,
      createdAt: archived.createdAt,
      updatedAt: archived.updatedAt,
    });
    setTreatments((prev) =>
      sortTreatments([
        ...prev.filter((item) => item.id !== restoredRecord.id),
        restoredRecord,
      ]),
    );
    setFeedback('restored');
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== 'all' ||
    !includeInactive;

  const activeCountBadgeText =
    treatments.length === 1
      ? t('treatments.countSingle')
      : t('treatments.countPlural').replace(
          '{count}',
          String(treatments.length),
        );

  const archivedCountBadgeText =
    archivedTreatments.length === 1
      ? t('treatments.archivedCountSingle')
      : t('treatments.archivedCountPlural').replace(
          '{count}',
          String(archivedTreatments.length),
        );

  const resultsCountText = t('treatments.filters.resultsCount')
    .replace('{shown}', String(filteredTreatments.length))
    .replace('{total}', String(treatments.length));

  const feedbackKeys =
    feedback !== 'none' ? FEEDBACK_COPY_KEYS[feedback] : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary break-words">
              {t('treatments.title')}
            </h1>
            <Badge variant={isAdmin ? 'primary' : 'default'}>
              {isAdmin
                ? t('treatments.adminBadge')
                : t('treatments.readOnlyBadge')}
            </Badge>
            {effectiveTab === 'active' && !isLoading && !hasLoadError ? (
              <Badge variant="default">{activeCountBadgeText}</Badge>
            ) : null}
            {effectiveTab === 'archived' &&
            !isLoadingArchived &&
            !hasArchivedLoadError ? (
              <Badge variant="default">{archivedCountBadgeText}</Badge>
            ) : null}
          </div>
          <p className="max-w-3xl text-sm text-text-secondary break-words">
            {t('treatments.description')}
          </p>
        </div>

        {isAdmin && effectiveTab === 'active' ? (
          <Button
            type="button"
            variant={isCreateFormOpen ? 'outline' : 'default'}
            className="self-start shrink-0"
            onClick={() => {
              setEditingTreatment(null);
              setIsCreateFormOpen((prev) => !prev);
            }}
          >
            {isCreateFormOpen ? (
              <>
                <X className="h-4 w-4" aria-hidden="true" />
                <span>{t('treatments.closeFormButton')}</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{t('treatments.newTreatmentButton')}</span>
              </>
            )}
          </Button>
        ) : null}
      </div>

      {!isAdmin ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-bg p-4 text-warning-foreground"
        >
          <Lock
            className="mt-0.5 h-5 w-5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold break-words">
              {t('treatments.readOnlyTitle')}
            </p>
            <p className="text-sm break-words">
              {t('treatments.readOnlyDescription')}
            </p>
          </div>
        </div>
      ) : null}

      {isAdmin ? (
        <div
          role="tablist"
          aria-label={t('treatments.tabs.ariaLabel')}
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
            {t('treatments.tabs.active')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveTab === 'archived'}
            onClick={() => {
              setIsCreateFormOpen(false);
              setEditingTreatment(null);
              setActiveTab('archived');
            }}
            className={
              effectiveTab === 'archived'
                ? 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-surface-card px-3 text-xs font-semibold text-text-primary shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            }
          >
            <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('treatments.tabs.archived')}</span>
          </button>
        </div>
      ) : null}

      {feedbackKeys ? (
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
              {t(feedbackKeys.title)}
            </p>
            <p className="text-success-foreground/90 break-words">
              {t(feedbackKeys.description)}
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
            title={t('treatments.errors.archivedLoadTitle')}
            description={t('treatments.errors.archivedLoadDescription')}
            retryLabel={t('states.retry')}
            onRetry={() => void loadArchivedTreatments()}
          />
        ) : archivedTreatments.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-5 w-5" aria-hidden="true" />}
            title={t('treatments.empty.noArchivedTitle')}
            description={t('treatments.empty.noArchivedDescription')}
          />
        ) : (
          <div className="space-y-3">
            {archivedTreatments.map((treatment) => (
              <ArchivedTreatmentCard
                key={treatment.id}
                treatment={treatment}
                currencyConfig={clinic}
                onRestore={handleRestoreTreatment}
              />
            ))}
          </div>
        )
      ) : (
        <>
          {isAdmin && isCreateFormOpen ? (
            <TreatmentForm
              key="create-treatment"
              mode="create"
              clinic={clinic}
              onSubmit={handleCreateTreatment}
              onCancel={() => setIsCreateFormOpen(false)}
            />
          ) : null}

          {isAdmin && editingTreatment ? (
            <TreatmentForm
              key={editingTreatment.id}
              mode="edit"
              clinic={clinic}
              initialValues={editingTreatment}
              onSubmit={handleUpdateTreatment}
              onCancel={() => setEditingTreatment(null)}
            />
          ) : null}

          {isLoading ? (
            <LoadingState
              title={t('states.loadingTitle')}
              description={t('states.loadingDescription')}
            />
          ) : hasLoadError ? (
            <ErrorState
              title={t('treatments.errors.listLoadTitle')}
              description={t('treatments.errors.listLoadDescription')}
              retryLabel={t('states.retry')}
              onRetry={() => void loadTreatments()}
            />
          ) : treatments.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
              title={t('treatments.empty.noTreatmentsTitle')}
              description={
                isAdmin
                  ? t('treatments.empty.noTreatmentsDescription')
                  : t('treatments.empty.noTreatmentsReadOnlyDescription')
              }
              action={
                isAdmin && !isCreateFormOpen ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingTreatment(null);
                      setIsCreateFormOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{t('treatments.newTreatmentButton')}</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border border-border bg-surface-card p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="min-w-0 space-y-1.5 sm:col-span-2">
                    <Label htmlFor="treatments-search-input">
                      {t('treatments.filters.searchLabel')}
                    </Label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                        aria-hidden="true"
                      />
                      <Input
                        id="treatments-search-input"
                        type="search"
                        value={searchQuery}
                        placeholder={t('treatments.filters.searchPlaceholder')}
                        className="pl-9"
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor="treatments-category-filter">
                      {t('treatments.filters.categoryLabel')}
                    </Label>
                    <Select
                      id="treatments-category-filter"
                      value={categoryFilter}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'all' || isTreatmentCategory(value)) {
                          setCategoryFilter(value);
                        }
                      }}
                    >
                      <option value="all">
                        {t('treatments.categories.all')}
                      </option>
                      {TREATMENT_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {t(getTreatmentCategoryLabelKey(category))}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="treatments-include-inactive"
                      className="inline-flex items-center gap-2 text-xs font-medium text-text-secondary cursor-pointer"
                    >
                      <input
                        id="treatments-include-inactive"
                        type="checkbox"
                        checked={includeInactive}
                        onChange={(e) => setIncludeInactive(e.target.checked)}
                        className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <span>{t('treatments.filters.includeInactiveLabel')}</span>
                    </label>

                    {!includeInactive && pausedCount > 0 ? (
                      <span className="text-xs text-warning-foreground">
                        {t('treatments.filters.hiddenPausedHint').replace(
                          '{count}',
                          String(pausedCount),
                        )}
                      </span>
                    ) : null}
                  </div>

                  {hasActiveFilters ? (
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-xs text-text-muted">
                        {resultsCountText}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearchQuery('');
                          setCategoryFilter('all');
                          setIncludeInactive(true);
                        }}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span>{t('treatments.filters.clearButton')}</span>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              {filteredTreatments.length === 0 ? (
                <EmptyState
                  icon={<Search className="h-5 w-5" aria-hidden="true" />}
                  title={t('treatments.empty.noSearchResultsTitle')}
                  description={t('treatments.empty.noSearchResultsDescription')}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSearchQuery('');
                        setCategoryFilter('all');
                        setIncludeInactive(true);
                      }}
                    >
                      {t('treatments.filters.clearButton')}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredTreatments.map((treatment) => (
                    <TreatmentCard
                      key={treatment.id}
                      treatment={treatment}
                      currencyConfig={clinic}
                      isAdmin={isAdmin}
                      onEdit={
                        isAdmin
                          ? (selected) => {
                              setIsCreateFormOpen(false);
                              setEditingTreatment(selected);
                            }
                          : undefined
                      }
                      onArchive={isAdmin ? handleArchiveTreatment : undefined}
                    />
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
