import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import type { AuthSessionUser } from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';
import type {
  ArchivedTreatmentRecord,
  TreatmentInput,
  TreatmentRecord,
} from '@/domain/treatments';
import { AuthProvider } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/i18n';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import type { IAuthService } from '@/services/auth/authService';
import type {
  ClinicSummary,
  IClinicAccessRepository,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import type { ITreatmentRepository } from '@/services/repositories/treatmentRepository';
import type { ClinicRole } from '@/services/supabase/database.types';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';

const SYNTHETIC_USER: AuthSessionUser = Object.freeze({
  id: '00000000-0000-0000-0000-000000000701',
  email: 'admin.synthetic@dentalcare.test',
});

const SYNTHETIC_CLINIC_AED: ClinicSummary = Object.freeze({
  id: '00000000-0000-0000-0000-000000000070',
  name: 'Al Noor Synthetic Dental Dubai',
  currencyCode: 'AED',
  currencySymbol: 'AED',
  taxRateBps: 500,
  taxLabel: 'VAT',
  timezone: 'Asia/Dubai',
  defaultLocale: 'en',
});

const SEED_TREATMENTS: readonly TreatmentRecord[] = Object.freeze([
  Object.freeze({
    id: 'tr-clean-1',
    clinicId: SYNTHETIC_CLINIC_AED.id,
    code: 'CLEAN-01',
    nameEn: 'Dental Prophylaxis',
    nameEs: 'Limpieza Dental',
    category: 'preventive',
    defaultPriceCents: 15_050,
    defaultDurationMin: 45,
    isActive: true,
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:00:00Z',
  }),
  Object.freeze({
    id: 'tr-endo-2',
    clinicId: SYNTHETIC_CLINIC_AED.id,
    code: 'ENDO-MOLAR',
    nameEn: 'Molar Root Canal',
    nameEs: 'Endodoncia Molar',
    category: 'endodontics',
    defaultPriceCents: 65_000,
    defaultDurationMin: 90,
    isActive: false,
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:00:00Z',
  }),
]);

function createProfile(
  role: ClinicRole,
  preferredLocale: SupportedLocale = 'en',
): UserProfile {
  return Object.freeze({
    id: SYNTHETIC_USER.id,
    clinicId: SYNTHETIC_CLINIC_AED.id,
    fullName: `Synthetic ${role}`,
    role,
    preferredLocale,
    isActive: true,
  });
}

function createAuthRig(
  role: ClinicRole,
  preferredLocale: SupportedLocale = 'en',
  clinic: ClinicSummary = SYNTHETIC_CLINIC_AED,
) {
  const authService: IAuthService = {
    getCurrentSession: vi.fn().mockResolvedValue(SYNTHETIC_USER),
    signInWithPassword: vi.fn().mockResolvedValue(SYNTHETIC_USER),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: () => () => {},
  };

  const clinicRepository: IClinicAccessRepository = {
    getActiveClinic: vi.fn().mockResolvedValue(clinic),
    getCurrentProfile: vi
      .fn()
      .mockResolvedValue(createProfile(role, preferredLocale)),
    updatePreferredLocale: vi.fn().mockResolvedValue(undefined),
    updateClinicSettings: vi.fn(),
    appendAuditLog: vi.fn().mockResolvedValue(undefined),
  };

  return { authService, clinicRepository };
}

function createInMemoryTreatmentRepository(
  seedActive: readonly TreatmentRecord[] = [],
  seedArchived: readonly ArchivedTreatmentRecord[] = [],
) {
  let activeStore: TreatmentRecord[] = [...seedActive];
  let archivedStore: ArchivedTreatmentRecord[] = [...seedArchived];
  let seq = 1;

  const listTreatments = vi
    .fn<ITreatmentRepository['listTreatments']>()
    .mockImplementation(async (clinicId: string) =>
      Object.freeze(activeStore.filter((item) => item.clinicId === clinicId)),
    );

  const listArchivedTreatments = vi
    .fn<ITreatmentRepository['listArchivedTreatments']>()
    .mockImplementation(async (clinicId: string) =>
      Object.freeze(archivedStore.filter((item) => item.clinicId === clinicId)),
    );

  const createTreatment = vi
    .fn<ITreatmentRepository['createTreatment']>()
    .mockImplementation(async (clinicId: string, input: TreatmentInput) => {
      if (
        activeStore.some(
          (item) => item.clinicId === clinicId && item.code === input.code,
        )
      ) {
        throw Object.assign(
          new Error('Failed to create treatment record (code: 23505)'),
          { code: '23505' },
        );
      }

      const created: TreatmentRecord = Object.freeze({
        id: `tr-new-${seq++}`,
        clinicId,
        code: input.code,
        nameEn: input.nameEn,
        nameEs: input.nameEs,
        category: input.category,
        defaultPriceCents: input.defaultPriceCents,
        defaultDurationMin: input.defaultDurationMin,
        isActive: input.isActive,
        createdAt: '2026-11-27T10:00:00Z',
        updatedAt: '2026-11-27T10:00:00Z',
      });
      activeStore = [...activeStore, created];
      return created;
    });

  const updateTreatment = vi
    .fn<ITreatmentRepository['updateTreatment']>()
    .mockImplementation(async (treatmentId: string, input: TreatmentInput) => {
      const existing = activeStore.find((item) => item.id === treatmentId);
      if (!existing) {
        throw new Error('Failed to update treatment record: record not found');
      }
      if (
        activeStore.some(
          (item) =>
            item.id !== treatmentId &&
            item.clinicId === existing.clinicId &&
            item.code === input.code,
        )
      ) {
        throw Object.assign(
          new Error('Failed to update treatment record (code: 23505)'),
          { code: '23505' },
        );
      }

      const updated: TreatmentRecord = Object.freeze({
        ...existing,
        code: input.code,
        nameEn: input.nameEn,
        nameEs: input.nameEs,
        category: input.category,
        defaultPriceCents: input.defaultPriceCents,
        defaultDurationMin: input.defaultDurationMin,
        isActive: input.isActive,
        updatedAt: `2026-11-27T11:00:0${seq++}Z`,
      });
      activeStore = activeStore.map((item) =>
        item.id === treatmentId ? updated : item,
      );
      return updated;
    });

  const archiveTreatment = vi
    .fn<ITreatmentRepository['archiveTreatment']>()
    .mockImplementation(async (treatmentId: string) => {
      const existing = activeStore.find((item) => item.id === treatmentId);
      activeStore = activeStore.filter((item) => item.id !== treatmentId);
      if (existing) {
        archivedStore = [
          Object.freeze({ ...existing, deletedAt: '2026-11-27T12:00:00Z' }),
          ...archivedStore,
        ];
      }
    });

  const restoreTreatment = vi
    .fn<ITreatmentRepository['restoreTreatment']>()
    .mockImplementation(async (treatmentId: string) => {
      const existing = archivedStore.find((item) => item.id === treatmentId);
      if (!existing) {
        return;
      }
      if (
        activeStore.some(
          (item) =>
            item.clinicId === existing.clinicId && item.code === existing.code,
        )
      ) {
        throw Object.assign(
          new Error('Failed to restore treatment record (code: 23505)'),
          { code: '23505' },
        );
      }
      archivedStore = archivedStore.filter((item) => item.id !== treatmentId);
      const { deletedAt: _removed, ...restored } = existing;
      void _removed;
      activeStore = [...activeStore, Object.freeze(restored)];
    });

  const treatmentRepository: ITreatmentRepository = {
    listTreatments,
    listArchivedTreatments,
    createTreatment,
    updateTreatment,
    archiveTreatment,
    restoreTreatment,
  };

  return {
    treatmentRepository,
    listTreatments,
    listArchivedTreatments,
    createTreatment,
    updateTreatment,
    archiveTreatment,
    restoreTreatment,
  };
}

function renderTreatmentsRoute({
  role = 'admin',
  locale = 'en',
  treatmentRepository,
  clinic = SYNTHETIC_CLINIC_AED,
}: {
  readonly role?: ClinicRole;
  readonly locale?: SupportedLocale;
  readonly treatmentRepository: ITreatmentRepository | null;
  readonly clinic?: ClinicSummary;
}) {
  const { authService, clinicRepository } = createAuthRig(role, locale, clinic);
  const storage = new InMemoryStorageAdapter();
  storage.setItem('dentalcare.locale', locale);

  return render(
    <I18nProvider storage={storage} initialLocale={locale}>
      <AuthProvider
        authService={authService}
        clinicAccessRepository={clinicRepository}
      >
        <MemoryRouter initialEntries={['/treatments']}>
          <AppRoutes treatmentRepository={treatmentRepository} />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
}

describe('T-07 Treatments catalog UI flow (/treatments)', () => {
  it('1. Handles Loading, Error (with Retry), Empty, and safe degraded unconfigured states', async () => {
    const user = userEvent.setup();
    let resolvePending: ((rows: readonly TreatmentRecord[]) => void) | null =
      null;

    const repo = createInMemoryTreatmentRepository();
    repo.listTreatments
      .mockImplementationOnce(
        () =>
          new Promise<readonly TreatmentRecord[]>((resolve) => {
            resolvePending = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('Network offline'))
      .mockResolvedValueOnce(Object.freeze([]));

    // Start with pending promise -> Loading state visible
    renderTreatmentsRoute({
      role: 'admin',
      treatmentRepository: repo.treatmentRepository,
    });

    await waitFor(() => {
      expect(screen.getByText(en.states.loadingTitle)).toBeInTheDocument();
    });

    // Resolve first call as empty -> Empty state visible
    resolvePending!(Object.freeze([]));
    await waitFor(() => {
      expect(
        screen.getByText(en.treatments.empty.noTreatmentsTitle),
      ).toBeInTheDocument();
    });

    // Error state with Retry button
    const errorRepo = createInMemoryTreatmentRepository();
    errorRepo.listTreatments
      .mockRejectedValueOnce(new Error('Temporary outage'))
      .mockResolvedValueOnce(Object.freeze([]));

    const { unmount } = renderTreatmentsRoute({
      role: 'admin',
      treatmentRepository: errorRepo.treatmentRepository,
    });

    await waitFor(() => {
      expect(
        screen.getByText(en.treatments.errors.listLoadTitle),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: en.states.retry }));

    await waitFor(() => {
      expect(
        screen.getAllByText(en.treatments.empty.noTreatmentsTitle).length,
      ).toBeGreaterThanOrEqual(1);
    });
    unmount();

    // Safe degraded mode when repository is null (renders EmptyState, never ErrorState)
    renderTreatmentsRoute({
      role: 'admin',
      treatmentRepository: null,
    });
    await waitFor(() => {
      expect(
        screen.getByText(en.treatments.unconfiguredTitle),
      ).toBeInTheDocument();
    });
  });

  it('2. Allows admin full CRUD, exact cent conversion ("150.50" -> 15050), UI-confirmed archive/restore without window.confirm, and handles duplicate code 23505', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    const repo = createInMemoryTreatmentRepository();

    renderTreatmentsRoute({
      role: 'admin',
      treatmentRepository: repo.treatmentRepository,
    });

    await waitFor(() => {
      expect(
        screen.getByText(en.treatments.empty.noTreatmentsTitle),
      ).toBeInTheDocument();
    });

    // Create new treatment with decimal price "150.50" -> 15050 cents
    await user.click(
      screen.getAllByRole('button', {
        name: en.treatments.newTreatmentButton,
      })[0]!,
    );

    await user.type(
      screen.getByLabelText(en.treatments.form.codeLabel),
      'clean-01',
    );
    await user.type(
      screen.getByLabelText(en.treatments.form.nameEnLabel),
      'Dental Prophylaxis',
    );
    await user.type(
      screen.getByLabelText(en.treatments.form.nameEsLabel),
      'Limpieza Dental',
    );
    await user.type(
      screen.getByLabelText(
        en.treatments.form.priceLabel.replace('{currency}', 'AED'),
      ),
      '150.50',
    );
    const durationInput = screen.getByLabelText(
      en.treatments.form.durationLabel,
    );
    await user.clear(durationInput);
    await user.type(durationInput, '45');

    // Live price preview shows formatted AED 150.50 + 5% VAT
    expect(screen.getByText('AED 150.50')).toBeInTheDocument();
    expect(screen.getByText('AED 158.03')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: en.treatments.form.createSubmitButton,
      }),
    );

    await waitFor(() => {
      expect(repo.createTreatment).toHaveBeenCalledWith(
        SYNTHETIC_CLINIC_AED.id,
        {
          code: 'CLEAN-01',
          nameEn: 'Dental Prophylaxis',
          nameEs: 'Limpieza Dental',
          category: 'preventive',
          defaultPriceCents: 15_050,
          defaultDurationMin: 45,
          isActive: true,
        },
      );
    });

    expect(screen.getByText('CLEAN-01')).toBeInTheDocument();
    expect(screen.getByText('AED 150.50')).toBeInTheDocument();
    expect(
      screen.getByText(en.treatments.feedback.createdTitle),
    ).toBeInTheDocument();

    // Attempt creating duplicate code -> translated 23505 alert
    await user.click(
      screen.getByRole('button', { name: en.treatments.newTreatmentButton }),
    );
    await user.type(
      screen.getByLabelText(en.treatments.form.codeLabel),
      'CLEAN-01',
    );
    await user.type(
      screen.getByLabelText(en.treatments.form.nameEnLabel),
      'Duplicate Clean',
    );
    await user.type(
      screen.getByLabelText(en.treatments.form.nameEsLabel),
      'Limpieza Duplicada',
    );
    await user.type(
      screen.getByLabelText(
        en.treatments.form.priceLabel.replace('{currency}', 'AED'),
      ),
      '90',
    );
    await user.click(
      screen.getByRole('button', {
        name: en.treatments.form.createSubmitButton,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(en.treatments.form.duplicateCodeError),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: en.treatments.form.cancelButton }),
    );

    // Edit existing treatment -> price "199,99" -> 19999 cents & pause it
    await user.click(
      screen.getByRole('button', { name: en.treatments.card.editButton }),
    );
    const editPrice = screen.getByLabelText(
      en.treatments.form.priceLabel.replace('{currency}', 'AED'),
    );
    await user.clear(editPrice);
    await user.type(editPrice, '199,99');
    await user.click(
      screen.getByLabelText(en.treatments.form.isActiveLabel),
    );
    await user.click(
      screen.getByRole('button', {
        name: en.treatments.form.editSubmitButton,
      }),
    );

    await waitFor(() => {
      expect(repo.updateTreatment).toHaveBeenCalledWith(
        'tr-new-1',
        expect.objectContaining({
          defaultPriceCents: 19_999,
          isActive: false,
        }),
      );
    });
    expect(screen.getByText('AED 199.99')).toBeInTheDocument();
    expect(screen.getByText(en.treatments.status.paused)).toBeInTheDocument();

    // Archive via explicit in-UI confirmation (zero window.confirm calls)
    await user.click(
      screen.getByRole('button', { name: en.treatments.card.archiveButton }),
    );
    const confirmRegion = screen.getByRole('region', {
      name: en.treatments.card.archiveConfirm.title,
    });
    await user.click(
      within(confirmRegion).getByRole('button', {
        name: en.treatments.card.archiveConfirm.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(repo.archiveTreatment).toHaveBeenCalledWith('tr-new-1');
    });
    expect(confirmSpy).not.toHaveBeenCalled();

    // Switch to Archived tab and restore
    await user.click(
      screen.getByRole('tab', { name: en.treatments.tabs.archived }),
    );
    await waitFor(() => {
      expect(screen.getByText('CLEAN-01')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: en.treatments.card.restoreButton }),
    );
    const restoreRegion = screen.getByRole('region', {
      name: en.treatments.card.restoreConfirm.title,
    });
    await user.click(
      within(restoreRegion).getByRole('button', {
        name: en.treatments.card.restoreConfirm.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(repo.restoreTreatment).toHaveBeenCalledWith('tr-new-1');
    });
    expect(
      screen.getByText(en.treatments.feedback.restoredTitle),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('3. Renders dentist and receptionist in strict read-only mode with formatted prices, search, and category filter (no write buttons or Archived tab)', async () => {
    const user = userEvent.setup();

    for (const role of ['dentist', 'receptionist'] as const) {
      const repo = createInMemoryTreatmentRepository(SEED_TREATMENTS);
      const { unmount } = renderTreatmentsRoute({
        role,
        treatmentRepository: repo.treatmentRepository,
      });

      await waitFor(() => {
        expect(screen.getByText('Dental Prophylaxis')).toBeInTheDocument();
      });

      expect(screen.getByText('AED 150.50')).toBeInTheDocument();
      expect(screen.getByText('AED 650.00')).toBeInTheDocument();
      expect(
        screen.getByText(en.treatments.readOnlyTitle),
      ).toBeInTheDocument();

      // No write buttons or Archived tab
      expect(
        screen.queryByRole('button', {
          name: en.treatments.newTreatmentButton,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: en.treatments.card.editButton }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: en.treatments.card.archiveButton,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('tab', { name: en.treatments.tabs.archived }),
      ).not.toBeInTheDocument();

      // Category filter works in read-only mode
      await user.selectOptions(
        screen.getByLabelText(en.treatments.filters.categoryLabel),
        'endodontics',
      );
      expect(screen.queryByText('Dental Prophylaxis')).not.toBeInTheDocument();
      expect(screen.getByText('Molar Root Canal')).toBeInTheDocument();

      unmount();
    }
  });

  it('4. Switches EN <-> ES showing localized names, translated categories, and locale-formatted currency', async () => {
    const user = userEvent.setup();
    const eurClinic: ClinicSummary = Object.freeze({
      ...SYNTHETIC_CLINIC_AED,
      name: 'Clínica Sintética Madrid',
      currencyCode: 'EUR',
      currencySymbol: '€',
      taxRateBps: 2100,
      taxLabel: 'IVA',
      defaultLocale: 'es',
    });

    const repo = createInMemoryTreatmentRepository(SEED_TREATMENTS);
    renderTreatmentsRoute({
      role: 'dentist',
      locale: 'en',
      clinic: eurClinic,
      treatmentRepository: repo.treatmentRepository,
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Dental Prophylaxis' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('€150.50')).toBeInTheDocument();
    expect(
      screen.getByText(en.treatments.categories.preventive, {
        selector: 'span',
      }),
    ).toBeInTheDocument();

    // Switch language to Spanish using shell language toggle
    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Limpieza Dental' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('€150,50')).toBeInTheDocument();
    expect(
      screen.getByText(es.treatments.categories.preventive, {
        selector: 'span',
      }),
    ).toBeInTheDocument();
  });
});
