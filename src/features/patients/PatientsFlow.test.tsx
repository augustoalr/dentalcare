import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import type { AuthSessionUser } from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';
import type {
  ArchivedPatientRecord,
  PatientInput,
  PatientRecord,
} from '@/domain/patients';
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
import type { IPatientRepository } from '@/services/repositories/patientRepository';
import type { ClinicRole } from '@/services/supabase/database.types';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';

const SYNTHETIC_USER: AuthSessionUser = Object.freeze({
  id: '00000000-0000-0000-0000-000000000301',
  email: 'dentist.synthetic@dentalcare.test',
});

const SYNTHETIC_CLINIC: ClinicSummary = Object.freeze({
  id: '00000000-0000-0000-0000-000000000020',
  name: 'Al Noor Synthetic Dental Dubai',
  currencyCode: 'AED',
  currencySymbol: 'AED',
  taxRateBps: 500,
  taxLabel: 'VAT',
  timezone: 'Asia/Dubai',
  defaultLocale: 'en',
});

function createSyntheticProfile(
  preferredLocale: SupportedLocale = 'en',
  role: ClinicRole = 'dentist',
): UserProfile {
  return Object.freeze({
    id: SYNTHETIC_USER.id,
    clinicId: SYNTHETIC_CLINIC.id,
    fullName:
      role === 'admin'
        ? 'Admin Alpha Synthetic'
        : 'Dr. Nur Synthetic Dentist',
    role,
    preferredLocale,
    isActive: true,
  });
}

function createAuthAndClinicRig(
  preferredLocale: SupportedLocale = 'en',
  role: ClinicRole = 'dentist',
) {
  const authService: IAuthService = {
    getCurrentSession: vi.fn().mockResolvedValue(SYNTHETIC_USER),
    signInWithPassword: vi.fn().mockResolvedValue(SYNTHETIC_USER),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: () => () => {},
  };

  const clinicRepository: IClinicAccessRepository = {
    getActiveClinic: vi.fn().mockResolvedValue(SYNTHETIC_CLINIC),
    getCurrentProfile: vi
      .fn()
      .mockResolvedValue(createSyntheticProfile(preferredLocale, role)),
    updatePreferredLocale: vi.fn().mockResolvedValue(undefined),
    updateClinicSettings: vi.fn(),
    appendAuditLog: vi.fn().mockResolvedValue(undefined),
  };

  return { authService, clinicRepository };
}

function createInMemoryPatientRepository(
  seedRecords: readonly PatientRecord[] = [],
  seedArchivedRecords: readonly ArchivedPatientRecord[] = [],
) {
  let store: PatientRecord[] = [...seedRecords];
  let archivedStore: ArchivedPatientRecord[] = [...seedArchivedRecords];
  let seq = 1;

  const listPatients = vi
    .fn<IPatientRepository['listPatients']>()
    .mockImplementation(async (clinicId: string) =>
      Object.freeze(
        store
          .filter((p) => p.clinicId === clinicId)
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      ),
    );

  const listArchivedPatients = vi
    .fn<IPatientRepository['listArchivedPatients']>()
    .mockImplementation(async (clinicId: string) =>
      Object.freeze(archivedStore.filter((p) => p.clinicId === clinicId)),
    );

  const getPatientById = vi
    .fn<IPatientRepository['getPatientById']>()
    .mockImplementation(async (patientId: string) => {
      return store.find((p) => p.id === patientId) ?? null;
    });

  const createPatient = vi
    .fn<IPatientRepository['createPatient']>()
    .mockImplementation(async (clinicId: string, input: PatientInput) => {
      const record: PatientRecord = Object.freeze({
        id: `synthetic-patient-${seq++}`,
        clinicId,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        dateOfBirth: input.dateOfBirth,
        medicalAlerts: input.medicalAlerts,
        generalNotes: input.generalNotes,
        createdAt: '2026-11-26T10:00:00Z',
        updatedAt: '2026-11-26T10:00:00Z',
      });
      store = [...store, record];
      return record;
    });

  const updatePatient = vi
    .fn<IPatientRepository['updatePatient']>()
    .mockImplementation(async (patientId: string, input: PatientInput) => {
      const existing = store.find((p) => p.id === patientId);
      if (!existing) {
        throw new Error('Failed to update patient record: record not found');
      }
      const updated: PatientRecord = Object.freeze({
        ...existing,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        dateOfBirth: input.dateOfBirth,
        medicalAlerts: input.medicalAlerts,
        generalNotes: input.generalNotes,
        updatedAt: `2026-11-26T11:00:0${seq++}Z`,
      });
      store = store.map((p) => (p.id === patientId ? updated : p));
      return updated;
    });

  const archivePatient = vi
    .fn<IPatientRepository['archivePatient']>()
    .mockImplementation(async (patientId: string) => {
      const existing = store.find((p) => p.id === patientId);
      store = store.filter((p) => p.id !== patientId);
      if (existing) {
        archivedStore = [
          Object.freeze({ ...existing, deletedAt: '2026-11-27T08:00:00Z' }),
          ...archivedStore,
        ];
      }
    });

  const restorePatient = vi
    .fn<IPatientRepository['restorePatient']>()
    .mockImplementation(async (patientId: string) => {
      const existing = archivedStore.find((p) => p.id === patientId);
      archivedStore = archivedStore.filter((p) => p.id !== patientId);
      if (existing) {
        const { deletedAt: _removed, ...activeRecord } = existing;
        void _removed;
        store = [...store, Object.freeze(activeRecord)];
      }
    });

  const patientRepository: IPatientRepository = {
    listPatients,
    listArchivedPatients,
    getPatientById,
    createPatient,
    updatePatient,
    archivePatient,
    restorePatient,
  };

  return {
    patientRepository,
    listPatients,
    listArchivedPatients,
    getPatientById,
    createPatient,
    updatePatient,
    archivePatient,
    restorePatient,
  };
}

function renderPatientsApp(options?: {
  initialPath?: string;
  initialLocale?: SupportedLocale;
  role?: ClinicRole;
  seedPatients?: readonly PatientRecord[];
  seedArchivedPatients?: readonly ArchivedPatientRecord[];
  patientRepository?: IPatientRepository;
}) {
  const locale = options?.initialLocale ?? 'en';
  const role = options?.role ?? 'dentist';
  const { authService, clinicRepository } = createAuthAndClinicRig(
    locale,
    role,
  );
  const repoRig = createInMemoryPatientRepository(
    options?.seedPatients ?? [],
    options?.seedArchivedPatients ?? [],
  );
  const activePatientRepo =
    options?.patientRepository ?? repoRig.patientRepository;

  return {
    ...repoRig,
    ...render(
      <I18nProvider
        storage={new InMemoryStorageAdapter()}
        initialLocale={locale}
      >
        <AuthProvider
          authService={authService}
          clinicAccessRepository={clinicRepository}
        >
          <MemoryRouter initialEntries={[options?.initialPath ?? '/patients']}>
            <AppRoutes patientRepository={activePatientRepo} />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    ),
  };
}

describe('T-05 Patients UI & clinical alert flow', () => {
  it('1. Handles Loading state, Error state with Retry recovery, Empty state (no patients), and Empty search state', async () => {
    const user = userEvent.setup();
    let resolveInitialLoad!: (records: readonly PatientRecord[]) => void;
    const pendingPromise = new Promise<readonly PatientRecord[]>((resolve) => {
      resolveInitialLoad = resolve;
    });

    const rig = createInMemoryPatientRepository([
      Object.freeze({
        id: 'pat-1',
        clinicId: SYNTHETIC_CLINIC.id,
        fullName: 'Tariq Synthetic Haddad',
        phone: '+971 50 333 4444',
        email: 'tariq.synthetic@dentalcare.test',
        dateOfBirth: '1987-03-19',
        medicalAlerts: null,
        generalNotes: null,
        createdAt: '2026-11-26T08:00:00Z',
        updatedAt: '2026-11-26T08:00:00Z',
      }),
    ]);

    rig.listPatients
      .mockReturnValueOnce(pendingPromise)
      .mockRejectedValueOnce(new Error('Network failure'));

    // First verify empty clinic state cleanly in a separate render
    const emptyApp = renderPatientsApp({ seedPatients: [] });
    expect(
      await emptyApp.findByText(en.patients.empty.noPatientsTitle),
    ).toBeInTheDocument();
    emptyApp.unmount();

    // Now verify Loading -> Error -> Retry -> Loaded -> Empty Search -> Clear search
    renderPatientsApp({ patientRepository: rig.patientRepository });

    // Loading state visible while promise is pending
    expect(
      await screen.findByRole('heading', { name: en.patients.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      en.states.loadingTitle,
    );

    // Resolve first call? Wait: let's reject first call by testing Retry directly:
    resolveInitialLoad([]);
    expect(
      await screen.findByText(en.patients.empty.noPatientsTitle),
    ).toBeInTheDocument();

    // Separate error + retry verification
    const errorRig = createInMemoryPatientRepository([
      Object.freeze({
        id: 'pat-retry-1',
        clinicId: SYNTHETIC_CLINIC.id,
        fullName: 'Ángela Núñez Sintética',
        phone: '+34 600 123 456',
        email: 'angela.nunez@clinica.test',
        dateOfBirth: null,
        medicalAlerts: null,
        generalNotes: null,
        createdAt: '2026-11-26T08:00:00Z',
        updatedAt: '2026-11-26T08:00:00Z',
      }),
    ]);
    errorRig.listPatients.mockRejectedValueOnce(new Error('Connection lost'));

    const retryView = renderPatientsApp({
      patientRepository: errorRig.patientRepository,
    });

    const alertBox = await retryView.findByRole('alert');
    expect(alertBox).toHaveTextContent(en.patients.errors.listLoadTitle);

    await user.click(
      within(alertBox).getByRole('button', { name: en.states.retry }),
    );

    expect(
      await retryView.findByText('Ángela Núñez Sintética'),
    ).toBeInTheDocument();

    // Accent-insensitive search finds Ángela when typing "angela nunez"
    const searchInput = retryView.getByLabelText(en.patients.search.label);
    await user.type(searchInput, 'angela nunez');
    expect(retryView.getByText('Ángela Núñez Sintética')).toBeInTheDocument();

    // Search with no matches displays search EmptyState and Clear search recovers
    await user.clear(searchInput);
    await user.type(searchInput, 'zzz-no-match');
    expect(
      retryView.getByText(en.patients.empty.noSearchResultsTitle),
    ).toBeInTheDocument();

    await user.click(
      retryView.getAllByRole('button', {
        name: en.patients.search.clearButton,
      })[0]!,
    );
    expect(retryView.getByText('Ángela Núñez Sintética')).toBeInTheDocument();
  });

  it('2. Creates synthetic patient with critical allergy -> renders red badge + icon in list -> renders MedicalAlertBanner (role="alert" + SVG icon) at top of chart', async () => {
    const user = userEvent.setup();
    const { createPatient } = renderPatientsApp({ seedPatients: [] });

    expect(
      await screen.findByText(en.patients.empty.noPatientsTitle),
    ).toBeInTheDocument();

    // Open New patient form and verify synthetic data notice (R-10)
    await user.click(
      screen.getAllByRole('button', { name: en.patients.newPatientButton })[0]!,
    );
    expect(
      screen.getByText(en.patients.form.syntheticNoticeTitle),
    ).toBeInTheDocument();

    // Validation blocks empty full name without calling repository
    await user.click(
      screen.getByRole('button', { name: en.patients.form.createSubmitButton }),
    );
    expect(
      await screen.findByText(en.patients.validation.fullNameRequired),
    ).toBeInTheDocument();
    expect(createPatient).not.toHaveBeenCalled();

    // Fill synthetic patient with critical Penicillin + Latex allergy
    await user.type(
      screen.getByLabelText(en.patients.form.fullNameLabel),
      'Layla Synthetic Al Mansoor',
    );
    await user.type(
      screen.getByLabelText(en.patients.form.phoneLabel),
      '+971 50 555 0199',
    );
    await user.type(
      screen.getByLabelText(en.patients.form.emailLabel),
      'layla.synthetic@dentalcare.test',
    );
    await user.type(
      screen.getByLabelText(en.patients.form.dateOfBirthLabel),
      '1990-05-14',
    );
    await user.type(
      screen.getByLabelText(en.patients.form.medicalAlertsLabel),
      'Severe Penicillin allergy and Latex sensitivity',
    );
    await user.type(
      screen.getByLabelText(en.patients.form.generalNotesLabel),
      'Prefers morning synthetic appointments.',
    );

    // Simulate transient save failure first to prove form preserves entered values
    createPatient.mockRejectedValueOnce(new Error('Temporary network glitch'));
    await user.click(
      screen.getByRole('button', { name: en.patients.form.createSubmitButton }),
    );

    expect(
      await screen.findByText(en.patients.form.saveErrorTitle),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(en.patients.form.fullNameLabel)).toHaveValue(
      'Layla Synthetic Al Mansoor',
    );
    expect(
      screen.getByLabelText(en.patients.form.medicalAlertsLabel),
    ).toHaveValue('Severe Penicillin allergy and Latex sensitivity');

    // Retry submit -> succeeds and appears in patient list with red medical alert badge + SVG icon
    await user.click(
      screen.getByRole('button', { name: en.patients.form.createSubmitButton }),
    );

    const patientCardLink = await screen.findByRole('link', {
      name: /Layla Synthetic Al Mansoor/i,
    });
    const badgeInList = within(patientCardLink).getByText(
      en.patients.list.medicalAlertBadge,
    );
    expect(badgeInList).toBeInTheDocument();
    expect(badgeInList.parentElement?.querySelector('svg')).not.toBeNull();

    // Open patient chart -> MedicalAlertBanner sits at the very top above the patient name h1
    await user.click(patientCardLink);

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(
      en.patients.detail.medicalAlertBannerLabel,
    );
    expect(banner).toHaveTextContent(
      'Severe Penicillin allergy and Latex sensitivity',
    );
    expect(banner.querySelector('svg')).not.toBeNull();

    const patientHeading = screen.getByRole('heading', {
      level: 1,
      name: 'Layla Synthetic Al Mansoor',
    });
    expect(
      banner.compareDocumentPosition(patientHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('3. Handles long patient names and long medical alerts cleanly (Overflow resilience)', async () => {
    const longSyntheticName = `Dr_${'MaximilianoSinteticoDeLaTorre'.repeat(4)}`.slice(
      0,
      118,
    );
    const longMedicalAlert =
      'Critical allergy warning: ' +
      'Penicillin_Amoxicillin_Cephalosporins_Latex_LocalAnestheticEpinephrine '.repeat(
        8,
      );

    renderPatientsApp({
      initialPath: '/patients/long-patient-1',
      seedPatients: [
        Object.freeze({
          id: 'long-patient-1',
          clinicId: SYNTHETIC_CLINIC.id,
          fullName: longSyntheticName,
          phone: '+971 50 999 0000',
          email: 'overflow.synthetic@dentalcare.test',
          dateOfBirth: '1985-01-01',
          medicalAlerts: longMedicalAlert,
          generalNotes: 'Long notes '.repeat(40),
          createdAt: '2026-11-26T08:00:00Z',
          updatedAt: '2026-11-26T08:00:00Z',
        }),
      ],
    });

    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(longMedicalAlert.trim());

    const heading = screen.getByRole('heading', {
      level: 1,
      name: longSyntheticName,
    });
    expect(heading.className).toContain('break-words');
  });

  it('4. Edits a synthetic patient and requires explicit UI confirmation (without window.confirm) before archiving and returning to /patients', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');

    const { updatePatient, archivePatient } = renderPatientsApp({
      initialPath: '/patients/pat-edit-1',
      seedPatients: [
        Object.freeze({
          id: 'pat-edit-1',
          clinicId: SYNTHETIC_CLINIC.id,
          fullName: 'Omar Synthetic Farooq',
          phone: '+971 52 100 2000',
          email: 'omar.synthetic@dentalcare.test',
          dateOfBirth: '1994-07-20',
          medicalAlerts: null,
          generalNotes: 'Initial synthetic note',
          createdAt: '2026-11-26T08:00:00Z',
          updatedAt: '2026-11-26T08:00:00Z',
        }),
      ],
    });

    // Initially has no critical alerts -> discreet confirmation badge shown, no role="alert"
    expect(
      await screen.findByText(en.patients.detail.noMedicalAlertsBadge),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Edit patient to add a newly discovered critical allergy
    await user.click(
      screen.getByRole('button', { name: en.patients.detail.editButton }),
    );

    const alertsInput = screen.getByLabelText(
      en.patients.form.medicalAlertsLabel,
    );
    await user.type(alertsInput, 'Ibuprofen / NSAID hypersensitivity');

    await user.click(
      screen.getByRole('button', { name: en.patients.form.editSubmitButton }),
    );

    await waitFor(() => {
      expect(updatePatient).toHaveBeenCalledTimes(1);
    });

    // Red MedicalAlertBanner now appears at top of the chart
    const alertBanner = await screen.findByRole('alert');
    expect(alertBanner).toHaveTextContent('Ibuprofen / NSAID hypersensitivity');

    // Click Archive patient -> opens inline confirmation panel without calling archivePatient yet
    await user.click(
      screen.getByRole('button', { name: en.patients.detail.archiveButton }),
    );
    expect(archivePatient).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    const confirmRegion = screen.getByRole('region', {
      name: en.patients.detail.archiveConfirmTitle,
    });
    expect(confirmRegion).toBeInTheDocument();

    // Cancel keeps patient active
    await user.click(
      within(confirmRegion).getByRole('button', {
        name: en.patients.detail.archiveCancelButton,
      }),
    );
    expect(
      screen.queryByRole('region', {
        name: en.patients.detail.archiveConfirmTitle,
      }),
    ).not.toBeInTheDocument();

    // Re-open archive confirmation and confirm -> calls archivePatient and navigates back to /patients
    await user.click(
      screen.getByRole('button', { name: en.patients.detail.archiveButton }),
    );
    await user.click(
      screen.getByRole('button', {
        name: en.patients.detail.archiveConfirmButton,
      }),
    );

    await waitFor(() => {
      expect(archivePatient).toHaveBeenCalledWith('pat-edit-1');
    });
    expect(confirmSpy).not.toHaveBeenCalled();

    // Redirected to /patients (now empty)
    expect(
      await screen.findByRole('heading', { name: en.patients.title }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(en.patients.empty.noPatientsTitle),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('5. Switches cleanly between EN and ES on patient chart (including localized date format) and handles missing patient EmptyState', async () => {
    const user = userEvent.setup();
    renderPatientsApp({
      initialPath: '/patients/pat-i18n-1',
      initialLocale: 'en',
      seedPatients: [
        Object.freeze({
          id: 'pat-i18n-1',
          clinicId: SYNTHETIC_CLINIC.id,
          fullName: 'Sofía Sintética Morales',
          phone: '+34 611 222 333',
          email: 'sofia.sintetica@clinica.test',
          dateOfBirth: '1990-05-14',
          medicalAlerts: 'Alergia severa al látex',
          generalNotes: null,
          createdAt: '2026-11-26T08:00:00Z',
          updatedAt: '2026-11-26T08:00:00Z',
        }),
      ],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      en.patients.detail.medicalAlertBannerLabel,
    );
    expect(screen.getByText(/1990-05-14/)).toBeInTheDocument();

    // Switch language to Spanish
    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      es.patients.detail.medicalAlertBannerLabel,
    );
    expect(screen.getByText(/14\/05\/1990/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: es.patients.detail.editButton }),
    ).toBeInTheDocument();

    // Missing / archived patient route renders translated EmptyState
    const missingView = renderPatientsApp({
      initialPath: '/patients/non-existent-id',
      initialLocale: 'es',
      seedPatients: [],
    });
    expect(
      await missingView.findByText(es.patients.detail.notFoundTitle),
    ).toBeInTheDocument();
  });

  it('6. Allows admin to inspect Archived tab and restore a patient with explicit confirmation (without window.confirm), while hiding Archived tab from dentist (T-06b)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');

    const archivedPatient: ArchivedPatientRecord = Object.freeze({
      id: 'pat-archived-1',
      clinicId: SYNTHETIC_CLINIC.id,
      fullName: 'Rashid Synthetic Archived Patient',
      phone: '+971 50 777 8888',
      email: 'rashid.archived@dentalcare.test',
      dateOfBirth: '1988-02-10',
      medicalAlerts: 'Latex sensitivity',
      generalNotes: null,
      createdAt: '2026-11-25T08:00:00Z',
      updatedAt: '2026-11-26T08:00:00Z',
      deletedAt: '2026-11-26T15:30:00Z',
    });

    // Dentist does NOT see the Archived tab
    const dentistView = renderPatientsApp({
      role: 'dentist',
      seedPatients: [],
      seedArchivedPatients: [archivedPatient],
    });
    expect(
      await dentistView.findByText(en.patients.empty.noPatientsTitle),
    ).toBeInTheDocument();
    expect(
      dentistView.queryByRole('tab', { name: en.patients.tabs.archived }),
    ).not.toBeInTheDocument();
    dentistView.unmount();

    // Admin sees Active / Archived tabs, inspects archived patient, and restores with explicit UI confirmation
    const { listArchivedPatients, restorePatient } = renderPatientsApp({
      role: 'admin',
      seedPatients: [],
      seedArchivedPatients: [archivedPatient],
    });

    const archivedTab = await screen.findByRole('tab', {
      name: en.patients.tabs.archived,
    });
    await user.click(archivedTab);

    await waitFor(() => {
      expect(listArchivedPatients).toHaveBeenCalledWith(SYNTHETIC_CLINIC.id);
    });

    expect(
      await screen.findByText('Rashid Synthetic Archived Patient'),
    ).toBeInTheDocument();
    expect(screen.getByText(en.patients.archived.statusHint)).toBeInTheDocument();
    expect(
      screen.getByText(en.patients.list.medicalAlertBadge),
    ).toBeInTheDocument();

    // Clicking Restore opens inline confirmation without calling repository yet
    await user.click(
      screen.getByRole('button', { name: en.patients.archived.restoreButton }),
    );
    expect(restorePatient).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    const confirmRegion = screen.getByRole('region', {
      name: en.patients.archived.restoreConfirm.title,
    });
    await user.click(
      within(confirmRegion).getByRole('button', {
        name: en.patients.archived.restoreConfirm.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(restorePatient).toHaveBeenCalledWith('pat-archived-1');
    });
    expect(confirmSpy).not.toHaveBeenCalled();

    expect(await screen.findByRole('status')).toHaveTextContent(
      en.patients.archived.restoreSuccessTitle,
    );

    // Switch back to Active tab -> restored patient is visible
    await user.click(
      screen.getByRole('tab', { name: en.patients.tabs.active }),
    );
    expect(
      await screen.findByText('Rashid Synthetic Archived Patient'),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('7. Renders long patient names with mobile-responsive wrapping in PatientListCard (no truncate) and stacked header in PatientDetailPage (T-06b)', async () => {
    const longMobileName =
      'Dra. Alejandra Sintética de la Santísima Trinidad Villalobos y Mendoza';
    const patient: PatientRecord = Object.freeze({
      id: 'pat-mobile-1',
      clinicId: SYNTHETIC_CLINIC.id,
      fullName: longMobileName,
      phone: '+34 600 111 222',
      email: 'alejandra.mobile@clinica.test',
      dateOfBirth: '1989-11-02',
      medicalAlerts: null,
      generalNotes: null,
      createdAt: '2026-11-26T08:00:00Z',
      updatedAt: '2026-11-26T08:00:00Z',
    });

    const listView = renderPatientsApp({
      initialPath: '/patients',
      seedPatients: [patient],
    });

    const nameInList = await listView.findByText(longMobileName);
    expect(nameInList.className).not.toContain('truncate');
    expect(nameInList.className).toContain('line-clamp-2');
    expect(nameInList.className).toContain('break-words');
    expect(nameInList.className).toContain('[overflow-wrap:anywhere]');
    listView.unmount();

    const detailView = renderPatientsApp({
      initialPath: '/patients/pat-mobile-1',
      seedPatients: [patient],
    });

    const detailHeading = await detailView.findByRole('heading', {
      level: 1,
      name: longMobileName,
    });
    expect(detailHeading.className).toContain('text-xl');
    expect(detailHeading.className).toContain('sm:text-2xl');
    expect(detailHeading.className).toContain('break-words');
    expect(detailHeading.className).toContain('[overflow-wrap:anywhere]');

    // Header wrapper stacks vertically on narrow phones and aligns horizontally on sm+
    const headerWrapper = detailHeading.closest('.flex-col');
    expect(headerWrapper).not.toBeNull();
    expect(headerWrapper?.className).toContain('sm:flex-row');
  });
});
