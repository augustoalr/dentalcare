import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import type { AuthSessionUser } from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { ClinicSettingsPage } from '@/features/settings/ClinicSettingsPage';
import { I18nProvider } from '@/i18n';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import type { IAuthService } from '@/services/auth/authService';
import type {
  ClinicSummary,
  IClinicAccessRepository,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';
import type { ClinicRole } from '@/services/supabase/database.types';

const SYNTHETIC_USER: AuthSessionUser = Object.freeze({
  id: '00000000-0000-0000-0000-000000000201',
  email: 'admin.synthetic@dentalcare.test',
});

const INITIAL_CLINIC: ClinicSummary = Object.freeze({
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Al Noor Synthetic Dental Clinic Dubai',
  currencyCode: 'AED',
  currencySymbol: 'AED',
  taxRateBps: 500,
  taxLabel: 'VAT',
  timezone: 'Asia/Dubai',
  defaultLocale: 'en',
});

function createProfile(role: ClinicRole): UserProfile {
  return Object.freeze({
    id: SYNTHETIC_USER.id,
    clinicId: INITIAL_CLINIC.id,
    fullName: 'Alex Synthetic Staff',
    role,
    preferredLocale: 'en',
    isActive: true,
  });
}

function createAuthService(
  sessionPromise?: Promise<AuthSessionUser | null>,
): IAuthService {
  return {
    getCurrentSession: vi
      .fn()
      .mockImplementation(
        () => sessionPromise ?? Promise.resolve(SYNTHETIC_USER),
      ),
    signInWithPassword: vi.fn().mockResolvedValue(SYNTHETIC_USER),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: () => () => {},
  };
}

function createSettingsRepository(options?: {
  role?: ClinicRole;
  clinic?: ClinicSummary | null;
}) {
  const role = options?.role ?? 'admin';
  const initialClinic =
    options && 'clinic' in options ? options.clinic : INITIAL_CLINIC;

  const updateClinicSettingsMock = vi
    .fn()
    .mockImplementation(async (clinicId: string, input) =>
      Object.freeze({
        id: clinicId,
        ...input,
      }),
    );

  const appendAuditLogMock = vi.fn().mockResolvedValue(undefined);

  const repository: IClinicAccessRepository = {
    getActiveClinic: vi.fn().mockResolvedValue(initialClinic),
    getCurrentProfile: vi.fn().mockResolvedValue(createProfile(role)),
    updatePreferredLocale: vi.fn().mockResolvedValue(undefined),
    updateClinicSettings: updateClinicSettingsMock,
    appendAuditLog: appendAuditLogMock,
  };

  return {
    repository,
    updateClinicSettingsMock,
    appendAuditLogMock,
  };
}

function renderSettingsApp(options?: {
  role?: ClinicRole;
  initialLocale?: SupportedLocale;
  repository?: IClinicAccessRepository;
  authService?: IAuthService;
}) {
  const rig = createSettingsRepository({ role: options?.role ?? 'admin' });
  const repository = options?.repository ?? rig.repository;
  const authService = options?.authService ?? createAuthService();
  const storage = new InMemoryStorageAdapter();

  return {
    ...rig,
    ...render(
      <I18nProvider
        storage={storage}
        initialLocale={options?.initialLocale ?? 'en'}
      >
        <AuthProvider
          authService={authService}
          clinicAccessRepository={repository}
        >
          <MemoryRouter initialEntries={['/settings']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    ),
  };
}

describe('T-04 ClinicSettingsPage — roles, presets, live preview, validation, and i18n', () => {
  it('1. Allows admin to edit clinic name, apply Spain EUR 21% IVA preset, verify live preview, save, and immediately update ClinicHeader without calling appendAuditLog on client', async () => {
    const user = userEvent.setup();
    const { updateClinicSettingsMock, appendAuditLogMock } = renderSettingsApp({
      role: 'admin',
    });

    expect(
      await screen.findByRole('heading', { name: en.settings.title }),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole('button', {
      name: en.settings.form.saveButton,
    });
    expect(saveButton).toBeDisabled();

    // Initial AED 5% VAT live preview (100.00 -> 5.00 -> 105.00)
    expect(screen.getByText('AED 100.00')).toBeInTheDocument();
    expect(screen.getByText('AED 5.00')).toBeInTheDocument();
    expect(screen.getByText('AED 105.00')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(en.settings.form.nameLabel);
    await user.clear(nameInput);
    await user.type(nameInput, 'Clínica Sintética Retiro Madrid');

    // Apply Spain preset (does NOT auto-save)
    await user.click(
      screen.getByRole('button', { name: en.settings.presets.spain }),
    );
    expect(updateClinicSettingsMock).not.toHaveBeenCalled();

    // Live preview updates immediately to EUR 21% IVA (€100.00 + €21.00 = €121.00)
    expect(screen.getByText('€100.00')).toBeInTheDocument();
    expect(screen.getByText('IVA (21%)')).toBeInTheDocument();
    expect(screen.getByText('€21.00')).toBeInTheDocument();
    expect(screen.getByText('€121.00')).toBeInTheDocument();

    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(updateClinicSettingsMock).toHaveBeenCalledTimes(1);
    });

    expect(updateClinicSettingsMock).toHaveBeenCalledWith(INITIAL_CLINIC.id, {
      name: 'Clínica Sintética Retiro Madrid',
      currencyCode: 'EUR',
      currencySymbol: '€',
      taxRateBps: 2100,
      taxLabel: 'IVA',
      timezone: 'Europe/Madrid',
      defaultLocale: 'es',
    });

    // Audit logging is performed atomically by PostgreSQL trigger, never duplicated on client
    expect(appendAuditLogMock).not.toHaveBeenCalled();

    // Success feedback shown, Save button disabled again, and ClinicHeader updated immediately
    expect(
      await screen.findByText(en.settings.feedback.savedTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: en.settings.form.saveButton }),
    ).toBeDisabled();
    expect(
      screen.getByText('Clínica Sintética Retiro Madrid'),
    ).toBeInTheDocument();
  });

  it('2. Displays translated validation errors (invalid currency code or 150% tax) without calling the repository', async () => {
    const user = userEvent.setup();
    const { updateClinicSettingsMock } = renderSettingsApp({ role: 'admin' });

    expect(
      await screen.findByRole('heading', { name: en.settings.title }),
    ).toBeInTheDocument();

    const currencyInput = screen.getByLabelText(
      en.settings.form.currencyCodeLabel,
    );
    const taxInput = screen.getByLabelText(en.settings.form.taxRateLabel);

    await user.clear(currencyInput);
    await user.type(currencyInput, 'EURO');
    await user.clear(taxInput);
    await user.type(taxInput, '150');

    await user.click(
      screen.getByRole('button', { name: en.settings.form.saveButton }),
    );

    expect(
      await screen.findByText(en.settings.validation.currencyCodeInvalid),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en.settings.validation.taxRateInvalid),
    ).toBeInTheDocument();
    expect(updateClinicSettingsMock).not.toHaveBeenCalled();
  });

  it('3. Displays an accessible error alert when saving fails while preserving all user-edited form values', async () => {
    const user = userEvent.setup();
    const rig = createSettingsRepository({ role: 'admin' });
    rig.updateClinicSettingsMock.mockRejectedValueOnce(
      new Error('Failed to update clinic settings: network error'),
    );

    renderSettingsApp({ role: 'admin', repository: rig.repository });

    expect(
      await screen.findByRole('heading', { name: en.settings.title }),
    ).toBeInTheDocument();

    const nameInput = screen.getByLabelText(en.settings.form.nameLabel);
    const taxInput = screen.getByLabelText(en.settings.form.taxRateLabel);

    await user.clear(nameInput);
    await user.type(nameInput, 'Unsaved Synthetic Clinic Name');
    await user.clear(taxInput);
    await user.type(taxInput, '7.5');

    await user.click(
      screen.getByRole('button', { name: en.settings.form.saveButton }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.settings.feedback.saveErrorTitle);
    expect(alert).toHaveTextContent(en.settings.feedback.saveErrorDescription);

    // User's edits remain intact on screen
    expect(nameInput).toHaveValue('Unsaved Synthetic Clinic Name');
    expect(taxInput).toHaveValue('7.5');
  });

  it.each(['dentist', 'receptionist'] as const)(
    '4. Renders strict read-only mode for %s (disabled fields, no presets, no Save button, translated permission notice) and blocks updateClinicSettings in AuthContext',
    async (nonAdminRole) => {
      const rig = createSettingsRepository({ role: nonAdminRole });

      let invokeUpdateDirectly!: () => Promise<unknown>;
      function DirectCallerProbe() {
        const { updateClinicSettings } = useAuth();
        invokeUpdateDirectly = () =>
          updateClinicSettings({
            name: 'Bypass Attempt',
            currencyCode: 'USD',
            currencySymbol: '$',
            taxRateBps: 0,
            taxLabel: 'Tax',
            timezone: 'UTC',
            defaultLocale: 'en',
          });
        return null;
      }

      render(
        <I18nProvider
          storage={new InMemoryStorageAdapter()}
          initialLocale="en"
        >
          <AuthProvider
            authService={createAuthService()}
            clinicAccessRepository={rig.repository}
          >
            <DirectCallerProbe />
            <MemoryRouter initialEntries={['/settings']}>
              <AppRoutes />
            </MemoryRouter>
          </AuthProvider>
        </I18nProvider>,
      );

      expect(
        await screen.findByRole('heading', { name: en.settings.title }),
      ).toBeInTheDocument();

      expect(screen.getByText(en.settings.readOnlyBadge)).toBeInTheDocument();
      expect(screen.getByText(en.settings.readOnlyTitle)).toBeInTheDocument();
      expect(
        screen.getByText(en.settings.readOnlyDescription),
      ).toBeInTheDocument();

      // Every form control is disabled
      expect(screen.getByLabelText(en.settings.form.nameLabel)).toBeDisabled();
      expect(
        screen.getByLabelText(en.settings.form.currencyCodeLabel),
      ).toBeDisabled();
      expect(
        screen.getByLabelText(en.settings.form.currencySymbolLabel),
      ).toBeDisabled();
      expect(
        screen.getByLabelText(en.settings.form.taxRateLabel),
      ).toBeDisabled();
      expect(
        screen.getByLabelText(en.settings.form.taxLabelLabel),
      ).toBeDisabled();
      expect(
        screen.getByLabelText(en.settings.form.timezoneLabel),
      ).toBeDisabled();
      expect(
        screen.getByLabelText(en.settings.form.defaultLocaleLabel),
      ).toBeDisabled();

      // Neither preset buttons nor Save button exist
      expect(
        screen.queryByRole('button', { name: en.settings.form.saveButton }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: en.settings.presets.spain }),
      ).not.toBeInTheDocument();

      // Defense in depth: direct context invocation rejects without touching network
      await expect(invokeUpdateDirectly()).rejects.toThrow(
        'Only clinic administrators can update clinic settings',
      );
      expect(rig.updateClinicSettingsMock).not.toHaveBeenCalled();
    },
  );

  it('5. Switches cleanly between EN and ES (including live money formatting) and handles defensive EmptyState', async () => {
    const user = userEvent.setup();
    renderSettingsApp({ role: 'admin', initialLocale: 'en' });

    expect(
      await screen.findByRole('heading', { name: en.settings.title }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: en.settings.presets.spain }),
    );
    expect(screen.getByText('€121.00')).toBeInTheDocument();

    // Switch active UI language to Spanish
    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(
      screen.getByRole('heading', { name: es.settings.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: es.settings.form.saveButton }),
    ).toBeInTheDocument();
    // Decimal separator switches to Spanish comma format while keeping unsaved preset edits
    expect(screen.getByText('€100,00')).toBeInTheDocument();
    expect(screen.getByText('€21,00')).toBeInTheDocument();
    expect(screen.getByText('€121,00')).toBeInTheDocument();

    // Defensive EmptyState when rendered standalone without active clinic
    const emptyRig = createSettingsRepository({ clinic: null });
    const standalone = render(
      <I18nProvider storage={new InMemoryStorageAdapter()} initialLocale="es">
        <AuthProvider
          authService={createAuthService(Promise.resolve(null))}
          clinicAccessRepository={emptyRig.repository}
        >
          <ClinicSettingsPage />
        </AuthProvider>
      </I18nProvider>,
    );

    expect(
      await standalone.findByText(es.settings.emptyTitle),
    ).toBeInTheDocument();
  });
});
