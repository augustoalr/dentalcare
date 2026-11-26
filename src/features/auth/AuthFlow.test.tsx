import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import type { AuthSessionUser } from '@/domain/auth';
import { LOCALE_STORAGE_KEY, type SupportedLocale } from '@/domain/locale';
import { AuthProvider } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/i18n';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import type {
  AuthChangeEvent,
  IAuthService,
} from '@/services/auth/authService';
import type {
  ClinicSummary,
  IClinicAccessRepository,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';

const SYNTHETIC_USER: AuthSessionUser = Object.freeze({
  id: '00000000-0000-0000-0000-000000000101',
  email: 'nur.synthetic@dentalcare.test',
});

const SYNTHETIC_CLINIC: ClinicSummary = Object.freeze({
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Al Noor Synthetic Dental Clinic Dubai',
  currencyCode: 'AED',
  currencySymbol: 'AED',
  taxRateBps: 500,
  taxLabel: 'VAT',
  timezone: 'Asia/Dubai',
  defaultLocale: 'en',
});

const SYNTHETIC_PROFILE: UserProfile = Object.freeze({
  id: SYNTHETIC_USER.id,
  clinicId: SYNTHETIC_CLINIC.id,
  fullName: 'Dr. Nur Synthetic Demo',
  role: 'dentist',
  preferredLocale: 'en',
  isActive: true,
});

interface MockAuthRig {
  authService: IAuthService;
  emitAuthEvent: (event: AuthChangeEvent, user: AuthSessionUser | null) => void;
  getCurrentSessionMock: ReturnType<typeof vi.fn>;
  signInWithPasswordMock: ReturnType<typeof vi.fn>;
  signOutMock: ReturnType<typeof vi.fn>;
}

function createMockAuthRig(
  initialSession: AuthSessionUser | null = null,
): MockAuthRig {
  let listener:
    | ((event: AuthChangeEvent, user: AuthSessionUser | null) => void)
    | null = null;

  const getCurrentSessionMock = vi.fn().mockResolvedValue(initialSession);
  const signInWithPasswordMock = vi.fn().mockResolvedValue(SYNTHETIC_USER);
  const signOutMock = vi.fn().mockImplementation(async () => {
    listener?.('SIGNED_OUT', null);
  });

  const authService: IAuthService = {
    getCurrentSession: getCurrentSessionMock,
    signInWithPassword: signInWithPasswordMock,
    signOut: signOutMock,
    onAuthStateChange: (cb) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };

  return {
    authService,
    emitAuthEvent: (event, user) => {
      listener?.(event, user);
    },
    getCurrentSessionMock,
    signInWithPasswordMock,
    signOutMock,
  };
}

function createMockRepository(overrides?: {
  clinic?: ClinicSummary | null;
  profile?: UserProfile | null;
}): {
  repository: IClinicAccessRepository;
  getActiveClinicMock: ReturnType<typeof vi.fn>;
  getCurrentProfileMock: ReturnType<typeof vi.fn>;
  updatePreferredLocaleMock: ReturnType<typeof vi.fn>;
} {
  const getActiveClinicMock = vi
    .fn()
    .mockResolvedValue(
      overrides && 'clinic' in overrides ? overrides.clinic : SYNTHETIC_CLINIC,
    );
  const getCurrentProfileMock = vi
    .fn()
    .mockResolvedValue(
      overrides && 'profile' in overrides
        ? overrides.profile
        : SYNTHETIC_PROFILE,
    );
  const updatePreferredLocaleMock = vi.fn().mockResolvedValue(undefined);
  const updateClinicSettingsMock = vi
    .fn()
    .mockImplementation(async (_clinicId, input) =>
      Object.freeze({
        id: SYNTHETIC_CLINIC.id,
        ...input,
      }),
    );

  const repository: IClinicAccessRepository = {
    getActiveClinic: getActiveClinicMock,
    getCurrentProfile: getCurrentProfileMock,
    updatePreferredLocale: updatePreferredLocaleMock,
    updateClinicSettings: updateClinicSettingsMock,
    appendAuditLog: vi.fn().mockResolvedValue(undefined),
  };

  return {
    repository,
    getActiveClinicMock,
    getCurrentProfileMock,
    updatePreferredLocaleMock,
  };
}

function renderAppFlow(options: {
  initialEntries?: string[];
  initialLocale?: SupportedLocale;
  storage?: InMemoryStorageAdapter;
  authService?: IAuthService | null;
  repository?: IClinicAccessRepository | null;
}) {
  const storage = options.storage ?? new InMemoryStorageAdapter();

  return {
    storage,
    ...render(
      <I18nProvider
        storage={storage}
        initialLocale={options.initialLocale ?? 'en'}
      >
        <AuthProvider
          authService={options.authService}
          clinicAccessRepository={options.repository}
        >
          <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    ),
  };
}

describe('T-03 Authentication, Route Protection, and Clinic Shell Flow', () => {
  it('1 & 2. redirects unauthenticated visitor from /patients to /login, then after sign-in restores /patients and displays clinic name + human role label', async () => {
    const user = userEvent.setup();
    const authRig = createMockAuthRig(null);
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/patients'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(en.auth.emailLabel),
      'nur.synthetic@dentalcare.test',
    );
    await user.type(
      screen.getByLabelText(en.auth.passwordLabel),
      'SyntheticPass!123',
    );
    await user.click(screen.getByRole('button', { name: en.auth.submitButton }));

    expect(
      await screen.findByRole('heading', { name: en.sections.patients.title }),
    ).toBeInTheDocument();

    expect(screen.getByText(SYNTHETIC_CLINIC.name)).toBeInTheDocument();
    expect(screen.getByText(SYNTHETIC_PROFILE.fullName)).toBeInTheDocument();
    expect(screen.getByText(en.roles.dentist)).toBeInTheDocument();
    expect(screen.queryByText('dentist')).not.toBeInTheDocument();
  });

  it('3. displays clear translated error on invalid credentials in EN and ES without leaving /login', async () => {
    const user = userEvent.setup();
    const authRig = createMockAuthRig(null);
    authRig.signInWithPasswordMock.mockRejectedValue({
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    });
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/login'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(en.auth.emailLabel),
      'wrong@dentalcare.test',
    );
    await user.type(
      screen.getByLabelText(en.auth.passwordLabel),
      'WrongPass999',
    );
    await user.click(screen.getByRole('button', { name: en.auth.submitButton }));

    const alertEn = await screen.findByRole('alert');
    expect(alertEn).toHaveTextContent(en.auth.errors.invalidCredentialsTitle);
    expect(alertEn).toHaveTextContent(en.auth.errors.invalidCredentialsBody);
    expect(
      screen.getByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      es.auth.errors.invalidCredentialsTitle,
    );
    expect(
      screen.getByRole('heading', { name: es.auth.loginTitle }),
    ).toBeInTheDocument();
  });

  it('4. displays LoadingState while initial session check is pending', async () => {
    let resolveSession!: (value: AuthSessionUser | null) => void;
    const authRig = createMockAuthRig(null);
    authRig.getCurrentSessionMock.mockReturnValue(
      new Promise<AuthSessionUser | null>((resolve) => {
        resolveSession = resolve;
      }),
    );
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/schedule'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      en.auth.checkingSessionTitle,
    );

    await act(async () => {
      resolveSession(null);
    });

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();
  });

  it('5a. redirects to /login with session-expired banner on involuntary SIGNED_OUT event', async () => {
    const authRig = createMockAuthRig(SYNTHETIC_USER);
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/schedule'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.sections.schedule.title }),
    ).toBeInTheDocument();

    act(() => {
      authRig.emitAuthEvent('SIGNED_OUT', null);
    });

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      en.auth.sessionExpiredTitle,
    );
  });

  it('5b. redirects cleanly to /login WITHOUT session-expired error on manual sign-out', async () => {
    const user = userEvent.setup();
    const authRig = createMockAuthRig(SYNTHETIC_USER);
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/schedule'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.sections.schedule.title }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.auth.signOutButton }),
    );

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(en.auth.sessionExpiredTitle),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('5c. does NOT misclassify manual sign-out as session_expired when SIGNED_OUT arrives asynchronously after signOut() resolves (B-02)', async () => {
    const user = userEvent.setup();
    const authRig = createMockAuthRig(SYNTHETIC_USER);
    authRig.signOutMock.mockImplementation(async () => {
      // Emit SIGNED_OUT both on a post-await microtask (before React re-renders, after
      // manualSignOutRef resets to false) and on a macrotask timer.
      queueMicrotask(() => {
        queueMicrotask(() => {
          authRig.emitAuthEvent('SIGNED_OUT', null);
        });
      });
      setTimeout(() => {
        authRig.emitAuthEvent('SIGNED_OUT', null);
      }, 0);
    });
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/schedule'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.sections.schedule.title }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.auth.signOutButton }),
    );

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();

    // Flush the delayed timer to ensure the async SIGNED_OUT listener executes.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(
      screen.queryByText(en.auth.sessionExpiredTitle),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('6. renders ErrorState with Sign out option when authenticated account has no active profile (profile_missing)', async () => {
    const user = userEvent.setup();
    const authRig = createMockAuthRig(SYNTHETIC_USER);
    const repoRig = createMockRepository({ profile: null });

    renderAppFlow({
      initialEntries: ['/schedule'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.auth.profileMissingTitle);
    expect(
      screen.queryByRole('navigation', { name: en.nav.ariaLabel }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.auth.signOutButton }),
    );

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();
  });

  it('7. shows translated unconfigured notice and disables sign-in without faking a session when backend is unconfigured', async () => {
    renderAppFlow({
      initialEntries: ['/patients'],
      authService: null,
      repository: null,
    });

    expect(
      await screen.findByRole('heading', { name: en.auth.loginTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      en.auth.unconfiguredTitle,
    );
    expect(
      screen.getByRole('button', { name: en.auth.submitButton }),
    ).toBeDisabled();
  });

  it('8. persists EN <-> ES language changes both locally and via updatePreferredLocale in the shell', async () => {
    const user = userEvent.setup();
    const storage = new InMemoryStorageAdapter();
    const authRig = createMockAuthRig(SYNTHETIC_USER);
    const repoRig = createMockRepository();

    renderAppFlow({
      initialEntries: ['/schedule'],
      storage,
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.sections.schedule.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(en.roles.dentist)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(
      screen.getByRole('heading', { name: es.sections.schedule.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(es.roles.dentist)).toBeInTheDocument();
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('es');

    await waitFor(() => {
      expect(repoRig.updatePreferredLocaleMock).toHaveBeenCalledWith(
        SYNTHETIC_PROFILE.id,
        'es',
      );
    });
  });

  it('9. supports mobile navigation drawer (open, Escape close, section navigation) and truncates long clinic/user names safely', async () => {
    const user = userEvent.setup();
    const longClinicName =
      'Al Noor International Advanced Multi-Specialty Synthetic Dental Care Center Dubai Marina Boulevard';
    const longDoctorName =
      'Dr. Nur Abou Harb Specialist in Restorative and Aesthetic Synthetic Dentistry';

    const authRig = createMockAuthRig(SYNTHETIC_USER);
    const repoRig = createMockRepository({
      clinic: { ...SYNTHETIC_CLINIC, name: longClinicName },
      profile: {
        ...SYNTHETIC_PROFILE,
        fullName: longDoctorName,
        role: 'admin',
      },
    });

    renderAppFlow({
      initialEntries: ['/schedule'],
      authService: authRig.authService,
      repository: repoRig.repository,
    });

    expect(
      await screen.findByRole('heading', { name: en.sections.schedule.title }),
    ).toBeInTheDocument();

    const clinicLabel = screen.getByText(longClinicName);
    const userLabel = screen.getByText(longDoctorName);
    expect(clinicLabel).toHaveClass('truncate');
    expect(userLabel).toHaveClass('truncate');
    expect(screen.getByText(en.roles.admin)).toBeInTheDocument();
    expect(screen.queryByText('admin')).not.toBeInTheDocument();

    const openMenuBtn = screen.getByRole('button', { name: en.nav.openMenu });
    expect(openMenuBtn).toHaveAttribute('aria-expanded', 'false');
    expect(openMenuBtn).not.toHaveAttribute('aria-controls');
    await user.click(openMenuBtn);

    expect(openMenuBtn).toHaveAttribute('aria-expanded', 'true');
    expect(openMenuBtn).toHaveAttribute('aria-controls', 'clinic-mobile-drawer');

    const drawer = screen.getByRole('dialog', {
      name: en.nav.mobileDrawerTitle,
    });
    expect(drawer).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: en.nav.mobileDrawerTitle }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: en.nav.openMenu }));
    const reopenedDrawer = screen.getByRole('dialog', {
      name: en.nav.mobileDrawerTitle,
    });

    await user.click(
      within(reopenedDrawer).getByRole('link', { name: en.nav.billing }),
    );

    expect(
      screen.queryByRole('dialog', { name: en.nav.mobileDrawerTitle }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: en.sections.billing.title }),
    ).toBeInTheDocument();
  });
});
