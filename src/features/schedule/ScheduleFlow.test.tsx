import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import type {
  AppointmentRecord,
  ArchivedAppointmentRecord,
  ClinicProvider,
} from '@/domain/appointments';
import type { AuthSessionUser, UserRole } from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';
import type { PatientRecord } from '@/domain/patients';
import { AuthProvider } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/i18n';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import type { IAuthService } from '@/services/auth/authService';
import type { IAppointmentRepository } from '@/services/repositories/appointmentRepository';
import type {
  ClinicSummary,
  IClinicAccessRepository,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import type { IPatientRepository } from '@/services/repositories/patientRepository';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';

const SYNTHETIC_CLINIC: ClinicSummary = Object.freeze({
  id: 'clinic-t08-1',
  name: 'Al Noor Synthetic Clinic Dubai',
  currencyCode: 'AED',
  currencySymbol: 'AED',
  taxRateBps: 500,
  taxLabel: 'VAT',
  timezone: 'Asia/Dubai',
  defaultLocale: 'en',
});

const SYNTHETIC_PROVIDERS: readonly ClinicProvider[] = Object.freeze([
  Object.freeze({
    id: 'provider-nur',
    fullName: 'Dr. Nur Synthetic',
    role: 'dentist' as const,
  }),
  Object.freeze({
    id: 'provider-tariq',
    fullName: 'Dr. Tariq Synthetic',
    role: 'admin' as const,
  }),
]);

const SYNTHETIC_PATIENTS: readonly PatientRecord[] = Object.freeze([
  Object.freeze({
    id: 'patient-layla',
    clinicId: SYNTHETIC_CLINIC.id,
    fullName: 'Layla Synthetic Al Mansoor',
    phone: '+971 50 111 2222',
    email: 'layla@synthetic.test',
    dateOfBirth: '1990-05-12',
    medicalAlerts: 'Severe Penicillin allergy',
    generalNotes: null,
    createdAt: '2026-11-26T08:00:00.000Z',
    updatedAt: '2026-11-26T08:00:00.000Z',
  }),
  Object.freeze({
    id: 'patient-omar',
    clinicId: SYNTHETIC_CLINIC.id,
    fullName: 'Omar Synthetic Haddad',
    phone: '+971 50 333 4444',
    email: 'omar@synthetic.test',
    dateOfBirth: '1986-09-20',
    medicalAlerts: null,
    generalNotes: null,
    createdAt: '2026-11-26T08:00:00.000Z',
    updatedAt: '2026-11-26T08:00:00.000Z',
  }),
]);

function makeTodayAppointments(): readonly AppointmentRecord[] {
  // Build appointments anchored to today's date in Asia/Dubai so KPI panel always sees them
  const now = new Date();
  const dubaiFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayKey = dubaiFormatter.format(now); // YYYY-MM-DD in Asia/Dubai

  return Object.freeze([
    Object.freeze({
      id: 'appt-confirmed-1',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: 'patient-layla',
      dentistId: 'provider-nur',
      // 10:00 - 10:30 Asia/Dubai => 06:00 - 06:30 UTC
      startsAt: `${todayKey}T06:00:00.000Z`,
      endsAt: `${todayKey}T06:30:00.000Z`,
      status: 'confirmed' as const,
      reason: 'Synthetic cleaning and checkup',
      clinicalNotes: 'Existing confidential synthetic note',
      reminderSentAt: null,
      createdAt: '2026-11-27T08:00:00.000Z',
      updatedAt: '2026-11-27T08:00:00.000Z',
    }),
    Object.freeze({
      id: 'appt-pending-2',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: 'patient-omar',
      dentistId: 'provider-tariq',
      // 11:00 - 11:30 Asia/Dubai => 07:00 - 07:30 UTC
      startsAt: `${todayKey}T07:00:00.000Z`,
      endsAt: `${todayKey}T07:30:00.000Z`,
      status: 'scheduled' as const,
      reason: 'Synthetic consultation',
      clinicalNotes: null,
      reminderSentAt: null,
      createdAt: '2026-11-27T08:00:00.000Z',
      updatedAt: '2026-11-27T08:00:00.000Z',
    }),
  ]);
}

function makeArchivedAppointment(): ArchivedAppointmentRecord {
  return Object.freeze({
    id: 'appt-archived-1',
    clinicId: SYNTHETIC_CLINIC.id,
    patientId: 'patient-omar',
    dentistId: 'provider-nur',
    startsAt: '2026-11-20T06:00:00.000Z',
    endsAt: '2026-11-20T06:30:00.000Z',
    status: 'cancelled' as const,
    reason: 'Cancelled synthetic checkup',
    clinicalNotes: null,
    reminderSentAt: null,
    createdAt: '2026-11-19T08:00:00.000Z',
    updatedAt: '2026-11-19T08:00:00.000Z',
    deletedAt: '2026-11-21T08:00:00.000Z',
  });
}

function createMockSessionRigs(role: UserRole, locale: SupportedLocale = 'en') {
  const user: AuthSessionUser = Object.freeze({
    id:
      role === 'admin'
        ? 'provider-tariq'
        : role === 'dentist'
          ? 'provider-nur'
          : 'user-receptionist',
    email: `${role}@synthetic.test`,
  });

  const profile: UserProfile = Object.freeze({
    id: user.id,
    clinicId: SYNTHETIC_CLINIC.id,
    fullName:
      role === 'admin'
        ? 'Dr. Tariq Synthetic'
        : role === 'dentist'
          ? 'Dr. Nur Synthetic'
          : 'Sara Synthetic Reception',
    role,
    preferredLocale: locale,
    isActive: true,
  });

  const authService: IAuthService = {
    getCurrentSession: vi.fn().mockResolvedValue(user),
    signInWithPassword: vi.fn().mockResolvedValue(user),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: () => () => {},
  };

  const clinicAccessRepository: IClinicAccessRepository = {
    getActiveClinic: vi.fn().mockResolvedValue(SYNTHETIC_CLINIC),
    getCurrentProfile: vi.fn().mockResolvedValue(profile),
    updatePreferredLocale: vi.fn().mockResolvedValue(undefined),
    updateClinicSettings: vi.fn().mockResolvedValue(SYNTHETIC_CLINIC),
    appendAuditLog: vi.fn().mockResolvedValue(undefined),
  };

  return { authService, clinicAccessRepository, profile };
}

function createInMemoryRepos(
  initialActive: readonly AppointmentRecord[],
  initialArchived: readonly ArchivedAppointmentRecord[] = [],
) {
  let activeList = [...initialActive];
  let archivedList = [...initialArchived];
  let seq = 100;

  const listAppointmentsByRange = vi.fn(
    async (
      _clinicId: string,
      range: { readonly startIso: string; readonly endIso: string },
      options?: { readonly includeClinicalNotes?: boolean },
    ) => {
      const startMs = Date.parse(range.startIso);
      const endMs = Date.parse(range.endIso);
      const includeNotes = options?.includeClinicalNotes !== false;
      return Object.freeze(
        activeList
          .filter(
            (a) =>
              Date.parse(a.startsAt) < endMs && Date.parse(a.endsAt) > startMs,
          )
          .map((a) =>
            includeNotes ? a : Object.freeze({ ...a, clinicalNotes: null }),
          ),
      );
    },
  );

  const listAppointmentsByPatient = vi.fn(
    async (
      _clinicId: string,
      patientId: string,
      options?: { readonly includeClinicalNotes?: boolean },
    ) => {
      const includeNotes = options?.includeClinicalNotes !== false;
      return Object.freeze(
        activeList
          .filter((a) => a.patientId === patientId)
          .map((a) =>
            includeNotes ? a : Object.freeze({ ...a, clinicalNotes: null }),
          ),
      );
    },
  );

  const listArchivedAppointments = vi.fn(async () =>
    Object.freeze([...archivedList]),
  );

  const createAppointment = vi.fn(async (clinicId, input, options) => {
    const includeNotes = options?.includeClinicalNotes !== false;
    const record: AppointmentRecord = Object.freeze({
      id: `appt-created-${++seq}`,
      clinicId,
      patientId: input.patientId,
      dentistId: input.dentistId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: input.status,
      reason: input.reason,
      clinicalNotes: includeNotes ? (input.clinicalNotes ?? null) : null,
      reminderSentAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    activeList = [...activeList, record];
    return record;
  });

  const updateAppointment = vi.fn(async (id, input, options) => {
    const includeNotes = options?.includeClinicalNotes !== false;
    const idx = activeList.findIndex((a) => a.id === id);
    if (idx === -1) {
      throw new Error('Not found');
    }
    const prev = activeList[idx]!;
    const updated: AppointmentRecord = Object.freeze({
      ...prev,
      dentistId: input.dentistId ?? prev.dentistId,
      startsAt: input.startsAt ?? prev.startsAt,
      endsAt: input.endsAt ?? prev.endsAt,
      status: input.status ?? prev.status,
      reason: input.reason !== undefined ? input.reason : prev.reason,
      clinicalNotes:
        includeNotes && input.clinicalNotes !== undefined
          ? input.clinicalNotes
          : includeNotes
            ? prev.clinicalNotes
            : null,
      updatedAt: new Date().toISOString(),
    });
    activeList = activeList.map((a) => (a.id === id ? updated : a));
    return updated;
  });

  const updateAppointmentStatus = vi.fn(async (id, status, options) => {
    const includeNotes = options?.includeClinicalNotes !== false;
    const prev = activeList.find((a) => a.id === id);
    if (!prev) {
      throw new Error('Not found');
    }
    const updated: AppointmentRecord = Object.freeze({
      ...prev,
      status,
      clinicalNotes: includeNotes ? prev.clinicalNotes : null,
      updatedAt: new Date().toISOString(),
    });
    activeList = activeList.map((a) => (a.id === id ? updated : a));
    return updated;
  });

  const updateClinicalNotes = vi.fn(async (id, notes) => {
    const prev = activeList.find((a) => a.id === id);
    if (!prev) {
      throw new Error('Not found');
    }
    const updated: AppointmentRecord = Object.freeze({
      ...prev,
      clinicalNotes: notes,
      updatedAt: new Date().toISOString(),
    });
    activeList = activeList.map((a) => (a.id === id ? updated : a));
    return updated;
  });

  const archiveAppointment = vi.fn(async (id) => {
    const target = activeList.find((a) => a.id === id);
    activeList = activeList.filter((a) => a.id !== id);
    if (target) {
      archivedList = [
        Object.freeze({ ...target, deletedAt: new Date().toISOString() }),
        ...archivedList,
      ];
    }
  });

  const restoreAppointment = vi.fn(async (id) => {
    const target = archivedList.find((a) => a.id === id);
    archivedList = archivedList.filter((a) => a.id !== id);
    if (target) {
      const { deletedAt: _removed, ...rest } = target;
      void _removed;
      activeList = [...activeList, Object.freeze(rest)];
    }
  });

  const appointmentRepository: IAppointmentRepository = {
    listClinicProviders: vi.fn().mockResolvedValue(SYNTHETIC_PROVIDERS),
    listAppointmentsByRange,
    listAppointmentsByPatient,
    listArchivedAppointments,
    createAppointment,
    updateAppointment,
    updateAppointmentStatus,
    updateClinicalNotes,
    archiveAppointment,
    restoreAppointment,
  };

  const patientRepository: IPatientRepository = {
    listPatients: vi.fn().mockResolvedValue(SYNTHETIC_PATIENTS),
    listArchivedPatients: vi.fn().mockResolvedValue([]),
    getPatientById: vi.fn(async (id) =>
      SYNTHETIC_PATIENTS.find((p) => p.id === id) ?? null,
    ),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    archivePatient: vi.fn(),
    restorePatient: vi.fn(),
  };

  return {
    appointmentRepository,
    patientRepository,
    spies: {
      listAppointmentsByRange,
      createAppointment,
      updateAppointmentStatus,
      updateClinicalNotes,
      archiveAppointment,
      restoreAppointment,
    },
  };
}

function renderScheduleApp(options: {
  role: UserRole;
  initialEntries?: string[];
  initialLocale?: SupportedLocale;
  appointmentRepository?: IAppointmentRepository | null;
  patientRepository?: IPatientRepository | null;
}) {
  const { authService, clinicAccessRepository } = createMockSessionRigs(
    options.role,
    options.initialLocale ?? 'en',
  );
  const storage = new InMemoryStorageAdapter();

  return render(
    <I18nProvider
      storage={storage}
      initialLocale={options.initialLocale ?? 'en'}
    >
      <AuthProvider
        authService={authService}
        clinicAccessRepository={clinicAccessRepository}
      >
        <MemoryRouter initialEntries={options.initialEntries ?? ['/schedule']}>
          <AppRoutes
            appointmentRepository={options.appointmentRepository}
            patientRepository={options.patientRepository}
          />
        </MemoryRouter>
      </AuthProvider>
    </I18nProvider>,
  );
}

describe('T-08 Schedule, Daily Summary Panel & Clinical Notes UI Flow', () => {
  it('1. handles Loading, Error (with Retry recovery), and Empty states cleanly', async () => {
    const user = userEvent.setup();
    const { appointmentRepository, patientRepository, spies } =
      createInMemoryRepos([]);

    let rejectFirstLoad!: (err: Error) => void;
    spies.listAppointmentsByRange.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirstLoad = reject;
        }),
    );

    renderScheduleApp({
      role: 'dentist',
      appointmentRepository,
      patientRepository,
    });

    expect(
      await screen.findByRole('heading', { name: en.sections.schedule.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(en.states.loadingTitle);

    rejectFirstLoad(new Error('Network error'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.schedule.errors.loadTitle);

    await user.click(screen.getByRole('button', { name: en.states.retry }));

    expect(
      await screen.findByText(en.schedule.empty.dayTitle),
    ).toBeInTheDocument();
  });

  it('2. renders Today Summary Panel KPIs accurately and supports Day <-> Week view switching', async () => {
    const user = userEvent.setup();
    const { appointmentRepository, patientRepository } = createInMemoryRepos(
      makeTodayAppointments(),
    );

    renderScheduleApp({
      role: 'dentist',
      appointmentRepository,
      patientRepository,
    });

    expect(
      await screen.findByText(en.schedule.today.title),
    ).toBeInTheDocument();

    const summaryCard = screen.getByLabelText(en.schedule.today.title);
    expect(within(summaryCard).getByText('2')).toBeInTheDocument(); // total today
    expect(
      within(summaryCard).getByText(en.schedule.today.confirmedLabel),
    ).toBeInTheDocument();
    expect(
      within(summaryCard).getByText(en.schedule.today.pendingLabel),
    ).toBeInTheDocument();

    // Medical alert badge appears on Layla's appointment card
    expect(
      screen.getAllByText(en.schedule.card.medicalAlertBadge).length,
    ).toBeGreaterThanOrEqual(1);

    // Switch Day -> Week
    const weekBtn = screen.getByRole('button', {
      name: en.schedule.controls.weekView,
    });
    await user.click(weekBtn);

    const refreshedSummary = await screen.findByLabelText(
      en.schedule.today.title,
    );
    expect(
      screen.getByRole('button', { name: en.schedule.controls.weekView }),
    ).toHaveAttribute('aria-pressed', 'true');
    // Today summary panel remains visible with today's count
    expect(within(refreshedSummary).getByText('2')).toBeInTheDocument();
  });

  it('3. detects dentist overlap in real time when creating an appointment and requires explicit confirmation', async () => {
    const user = userEvent.setup();
    const { appointmentRepository, patientRepository, spies } =
      createInMemoryRepos(makeTodayAppointments());

    renderScheduleApp({
      role: 'dentist',
      appointmentRepository,
      patientRepository,
    });

    await screen.findByText('Layla Synthetic Al Mansoor');

    await user.click(
      screen.getByRole('button', { name: en.schedule.newAppointmentButton }),
    );

    const submitBtn = screen.getByRole('button', {
      name: en.schedule.form.createSubmitButton,
    });
    const form = submitBtn.closest('form')!;

    // Pick patient Omar, dentist Dr. Nur (who already has 10:00-10:30 Dubai time), set 10:15-10:45
    await user.selectOptions(
      within(form).getByLabelText(en.schedule.form.patientLabel),
      'patient-omar',
    );
    await user.selectOptions(
      within(form).getByLabelText(en.schedule.form.dentistLabel),
      'provider-nur',
    );
    const startInput = within(form).getByLabelText(
      en.schedule.form.startTimeLabel,
    );
    const endInput = within(form).getByLabelText(en.schedule.form.endTimeLabel);
    await user.clear(startInput);
    await user.type(startInput, '10:15');
    await user.clear(endInput);
    await user.type(endInput, '10:45');

    // Overlap warning appears automatically
    expect(
      await within(form).findByText(en.schedule.form.overlapAlertTitle),
    ).toBeInTheDocument();

    // Submitting without checking the overlap confirmation checkbox is blocked
    await user.click(submitBtn);
    expect(
      within(form).getByText(
        en.schedule.validation.overlapConfirmationRequired,
      ),
    ).toBeInTheDocument();
    expect(spies.createAppointment).not.toHaveBeenCalled();

    // Check confirmation box and submit
    await user.click(
      within(form).getByLabelText(en.schedule.form.overlapAcknowledgeLabel),
    );
    await user.click(submitBtn);

    await waitFor(() => {
      expect(spies.createAppointment).toHaveBeenCalledTimes(1);
    });
  });

  it('4. supports quick status update, explicit UI archive confirmation (no window.confirm), and admin restoration from Archived tab', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { appointmentRepository, patientRepository, spies } =
      createInMemoryRepos(makeTodayAppointments(), [makeArchivedAppointment()]);

    renderScheduleApp({
      role: 'admin',
      appointmentRepository,
      patientRepository,
    });

    await screen.findByText('Layla Synthetic Al Mansoor');

    // Quick status change
    const statusSelect = screen.getByLabelText(
      en.schedule.card.statusSelectLabel.replace(
        '{patient}',
        'Layla Synthetic Al Mansoor',
      ),
    );
    await user.selectOptions(statusSelect, 'in_progress');
    await waitFor(() => {
      expect(spies.updateAppointmentStatus).toHaveBeenCalledWith(
        'appt-confirmed-1',
        'in_progress',
        { includeClinicalNotes: true },
      );
    });

    // Archive with inline confirmation panel (no window.confirm)
    const archiveButtons = screen.getAllByRole('button', {
      name: en.schedule.card.archiveButton,
    });
    await user.click(archiveButtons[0]!);
    expect(
      screen.getByText(en.schedule.confirm.archiveTitle),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: en.schedule.confirm.archiveConfirmButton,
      }),
    );
    await waitFor(() => {
      expect(spies.archiveAppointment).toHaveBeenCalledWith('appt-confirmed-1');
    });
    expect(confirmSpy).not.toHaveBeenCalled();

    // Switch to Archived tab (admin only) and restore
    await user.click(
      screen.getByRole('tab', { name: en.schedule.tabs.archived }),
    );
    expect(
      await screen.findByText('Cancelled synthetic checkup'),
    ).toBeInTheDocument();

    const restoreButtons = screen.getAllByRole('button', {
      name: en.schedule.archived.restoreButton,
    });
    await user.click(restoreButtons[0]!);
    await user.click(
      screen.getByRole('button', {
        name: en.schedule.confirm.restoreConfirmButton,
      }),
    );

    await waitFor(() => {
      expect(spies.restoreAppointment).toHaveBeenCalledTimes(1);
    });
    confirmSpy.mockRestore();
  });

  it('5. enforces clinical_notes role control: dentist can edit/save notes, while receptionist never sees or edits clinical_notes and requests includeClinicalNotes: false', async () => {
    const user = userEvent.setup();

    // Part A: Dentist edits and saves clinical notes
    const dentistRepos = createInMemoryRepos(makeTodayAppointments());
    const { unmount } = renderScheduleApp({
      role: 'dentist',
      appointmentRepository: dentistRepos.appointmentRepository,
      patientRepository: dentistRepos.patientRepository,
    });

    await screen.findByText('Layla Synthetic Al Mansoor');

    const notesButtons = screen.getAllByRole('button', {
      name: en.schedule.card.clinicalNotesButton,
    });
    await user.click(notesButtons[0]!);

    const textarea = screen.getByLabelText(en.schedule.clinicalNotes.label);
    await user.clear(textarea);
    await user.type(textarea, 'Synthetic occlusal composite note updated');
    await user.click(
      screen.getByRole('button', { name: en.schedule.clinicalNotes.saveButton }),
    );

    await waitFor(() => {
      expect(dentistRepos.spies.updateClinicalNotes).toHaveBeenCalledWith(
        'appt-confirmed-1',
        'Synthetic occlusal composite note updated',
      );
    });
    unmount();

    // Part B: Receptionist NEVER sees clinical notes button/editor/content
    const recRepos = createInMemoryRepos(makeTodayAppointments());
    renderScheduleApp({
      role: 'receptionist',
      appointmentRepository: recRepos.appointmentRepository,
      patientRepository: recRepos.patientRepository,
    });

    await screen.findByText('Layla Synthetic Al Mansoor');

    expect(
      screen.queryByRole('button', {
        name: en.schedule.card.clinicalNotesButton,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Existing confidential synthetic note'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: en.schedule.tabs.archived }),
    ).not.toBeInTheDocument();

    // Verify repository was called with includeClinicalNotes: false
    expect(recRepos.spies.listAppointmentsByRange).toHaveBeenCalledWith(
      SYNTHETIC_CLINIC.id,
      expect.any(Object),
      { includeClinicalNotes: false },
    );

    // Receptionist opens New Appointment form -> no clinical notes field
    await user.click(
      screen.getByRole('button', { name: en.schedule.newAppointmentButton }),
    );
    expect(
      screen.queryByLabelText(en.schedule.form.clinicalNotesLabel),
    ).not.toBeInTheDocument();

    // Receptionist can still update status cleanly
    const statusSelect = screen.getByLabelText(
      en.schedule.card.statusSelectLabel.replace(
        '{patient}',
        'Layla Synthetic Al Mansoor',
      ),
    );
    await user.selectOptions(statusSelect, 'completed');
    await waitFor(() => {
      expect(recRepos.spies.updateAppointmentStatus).toHaveBeenCalledWith(
        'appt-confirmed-1',
        'completed',
        { includeClinicalNotes: false },
      );
    });
  });

  it('6. switches EN <-> ES cleanly without exposing raw internal enum strings', async () => {
    const user = userEvent.setup();
    const { appointmentRepository, patientRepository } = createInMemoryRepos(
      makeTodayAppointments(),
    );

    renderScheduleApp({
      role: 'dentist',
      appointmentRepository,
      patientRepository,
    });

    await screen.findByText(en.schedule.today.title);
    expect(screen.queryByText('in_progress')).not.toBeInTheDocument();
    expect(screen.queryByText('no_show')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(
      screen.getByRole('heading', { name: es.sections.schedule.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.schedule.today.title)).toBeInTheDocument();
    expect(
      screen.getAllByText(es.schedule.statuses.confirmed).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('in_progress')).not.toBeInTheDocument();
    expect(screen.queryByText('no_show')).not.toBeInTheDocument();
  });
});
