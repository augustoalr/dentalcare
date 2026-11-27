import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import type { AuthSessionUser } from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';
import {
  PATIENT_FILE_MAX_SIZE_BYTES,
  type AllowedPatientFileMimeType,
  type ArchivedPatientFileRecord,
  type PatientFileRecord,
} from '@/domain/patientFiles';
import type { PatientRecord } from '@/domain/patients';
import { AuthProvider } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/i18n';
import en from '@/i18n/locales/en.json';
import es from '@/i18n/locales/es.json';
import type { IAuthService } from '@/services/auth/authService';
import type { IImageOptimizer } from '@/services/media/imageOptimizer';
import type {
  ClinicSummary,
  IClinicAccessRepository,
  UserProfile,
} from '@/services/repositories/clinicAccessRepository';
import type {
  IPatientFileRepository,
  UploadPatientFileParams,
} from '@/services/repositories/patientFileRepository';
import type { IPatientRepository } from '@/services/repositories/patientRepository';
import type { ClinicRole } from '@/services/supabase/database.types';
import { InMemoryStorageAdapter } from '@/services/storage/storageAdapter';

const SYNTHETIC_USER: AuthSessionUser = Object.freeze({
  id: '00000000-0000-0000-0000-000000000401',
  email: 'dentist.files@dentalcare.test',
});

const SYNTHETIC_CLINIC: ClinicSummary = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Al Noor Synthetic Dental Dubai',
  currencyCode: 'AED',
  currencySymbol: 'AED',
  taxRateBps: 500,
  taxLabel: 'VAT',
  timezone: 'Asia/Dubai',
  defaultLocale: 'en',
});

const SYNTHETIC_PATIENT: PatientRecord = Object.freeze({
  id: '22222222-2222-4222-8222-222222222222',
  clinicId: SYNTHETIC_CLINIC.id,
  fullName: 'Layla Synthetic Al Mansoor',
  phone: '+971 50 555 0199',
  email: 'layla.synthetic@dentalcare.test',
  dateOfBirth: '1990-05-14',
  medicalAlerts: 'Severe Penicillin allergy',
  generalNotes: 'Synthetic patient chart for private Storage gallery tests.',
  createdAt: '2026-11-26T08:00:00Z',
  updatedAt: '2026-11-26T08:00:00Z',
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
        : role === 'receptionist'
          ? 'Receptionist Alpha Synthetic'
          : 'Dr. Nur Synthetic Dentist',
    role,
    preferredLocale,
    isActive: true,
  });
}

function createInMemoryPatientFileRepository(
  seedFiles: readonly PatientFileRecord[] = [],
  seedArchivedFiles: readonly ArchivedPatientFileRecord[] = [],
) {
  let store: PatientFileRecord[] = [...seedFiles];
  let archivedStore: ArchivedPatientFileRecord[] = [...seedArchivedFiles];
  let seq = 1;

  const listPatientFiles = vi
    .fn<IPatientFileRepository['listPatientFiles']>()
    .mockImplementation(async (clinicId: string, patientId: string) =>
      Object.freeze(
        store.filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        ),
      ),
    );

  const listArchivedPatientFiles = vi
    .fn<IPatientFileRepository['listArchivedPatientFiles']>()
    .mockImplementation(async (clinicId: string, patientId: string) =>
      Object.freeze(
        archivedStore.filter(
          (item) => item.clinicId === clinicId && item.patientId === patientId,
        ),
      ),
    );

  const uploadPatientFile = vi
    .fn<IPatientFileRepository['uploadPatientFile']>()
    .mockImplementation(async (params: UploadPatientFileParams) => {
      const fileSeq = seq++;
      const ext =
        params.file.type === 'application/pdf'
          ? 'pdf'
          : params.file.type === 'image/png'
            ? 'png'
            : params.file.type === 'image/webp'
              ? 'webp'
              : 'jpg';
      const record: PatientFileRecord = Object.freeze({
        id: `33333333-3333-4333-8333-00000000000${fileSeq}`,
        clinicId: params.clinicId,
        patientId: params.patientId,
        appointmentId: null,
        storagePath: `${params.clinicId}/${params.patientId}/33333333-3333-4333-8333-00000000000${fileSeq}.${ext}`,
        fileName: params.file.name,
        mimeType: params.file.type as AllowedPatientFileMimeType,
        fileSizeBytes: params.file.size,
        uploadedBy: params.uploadedBy,
        createdAt: '2026-11-26T12:30:00Z',
      });
      store = [record, ...store];
      return record;
    });

  const createSignedFileUrl = vi
    .fn<IPatientFileRepository['createSignedFileUrl']>()
    .mockImplementation(async (storagePath: string) => {
      const tokenSeq = seq++;
      return `https://signed.example.test/storage/v1/object/sign/patient-files/${storagePath}?token=temp-token-${tokenSeq}`;
    });

  const archivePatientFile = vi
    .fn<IPatientFileRepository['archivePatientFile']>()
    .mockImplementation(async (fileId: string) => {
      const existing = store.find((item) => item.id === fileId);
      store = store.filter((item) => item.id !== fileId);
      if (existing) {
        archivedStore = [
          Object.freeze({ ...existing, deletedAt: '2026-11-27T08:00:00Z' }),
          ...archivedStore,
        ];
      }
    });

  const restorePatientFile = vi
    .fn<IPatientFileRepository['restorePatientFile']>()
    .mockImplementation(async (fileId: string) => {
      const existing = archivedStore.find((item) => item.id === fileId);
      archivedStore = archivedStore.filter((item) => item.id !== fileId);
      if (existing) {
        const { deletedAt: _removed, ...activeRecord } = existing;
        void _removed;
        store = [Object.freeze(activeRecord), ...store];
      }
    });

  const purgeArchivedPatientFile = vi
    .fn<IPatientFileRepository['purgeArchivedPatientFile']>()
    .mockImplementation(async (fileId: string) => {
      archivedStore = archivedStore.filter((item) => item.id !== fileId);
    });

  const purgeMistakenUpload = vi
    .fn<IPatientFileRepository['purgeMistakenUpload']>()
    .mockImplementation(async (fileId: string) => {
      store = store.filter((item) => item.id !== fileId);
    });

  const repository: IPatientFileRepository = {
    listPatientFiles,
    listArchivedPatientFiles,
    uploadPatientFile,
    createSignedFileUrl,
    archivePatientFile,
    restorePatientFile,
    purgeArchivedPatientFile,
    purgeMistakenUpload,
  };

  return {
    repository,
    listPatientFiles,
    listArchivedPatientFiles,
    uploadPatientFile,
    createSignedFileUrl,
    archivePatientFile,
    restorePatientFile,
    purgeArchivedPatientFile,
    purgeMistakenUpload,
  };
}

function renderPatientChartWithFiles(options?: {
  initialLocale?: SupportedLocale;
  role?: ClinicRole;
  seedFiles?: readonly PatientFileRecord[];
  seedArchivedFiles?: readonly ArchivedPatientFileRecord[];
  patientFileRepository?: IPatientFileRepository | null;
  imageOptimizer?: IImageOptimizer;
}) {
  const locale = options?.initialLocale ?? 'en';
  const role = options?.role ?? 'dentist';

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
      .mockResolvedValue(createSyntheticProfile(locale, role)),
    updatePreferredLocale: vi.fn().mockResolvedValue(undefined),
    updateClinicSettings: vi.fn(),
    appendAuditLog: vi.fn().mockResolvedValue(undefined),
  };

  const patientRepository: IPatientRepository = {
    listPatients: vi.fn().mockResolvedValue([SYNTHETIC_PATIENT]),
    listArchivedPatients: vi.fn().mockResolvedValue([]),
    getPatientById: vi.fn().mockResolvedValue(SYNTHETIC_PATIENT),
    createPatient: vi.fn(),
    updatePatient: vi.fn(),
    archivePatient: vi.fn(),
    restorePatient: vi.fn(),
  };

  const fileRig = createInMemoryPatientFileRepository(
    options?.seedFiles ?? [],
    options?.seedArchivedFiles ?? [],
  );
  const activeFileRepo =
    options && 'patientFileRepository' in options
      ? options.patientFileRepository
      : fileRig.repository;

  return {
    ...fileRig,
    ...render(
      <I18nProvider
        storage={new InMemoryStorageAdapter()}
        initialLocale={locale}
      >
        <AuthProvider
          authService={authService}
          clinicAccessRepository={clinicRepository}
        >
          <MemoryRouter initialEntries={[`/patients/${SYNTHETIC_PATIENT.id}`]}>
            <AppRoutes
              patientRepository={patientRepository}
              patientFileRepository={activeFileRepo}
              imageOptimizer={options?.imageOptimizer}
            />
          </MemoryRouter>
        </AuthProvider>
      </I18nProvider>,
    ),
  };
}

describe('T-06 Patient private clinical files UI & signed URL flow', () => {
  it('1. Handles Loading, Error (with Retry), and Empty states while keeping MedicalAlertBanner at the top of the chart', async () => {
    const user = userEvent.setup();
    let resolveInitialFiles!: (records: readonly PatientFileRecord[]) => void;
    const pendingList = new Promise<readonly PatientFileRecord[]>((resolve) => {
      resolveInitialFiles = resolve;
    });

    const rig = createInMemoryPatientFileRepository([]);
    rig.listPatientFiles.mockReturnValueOnce(pendingList);

    const view = renderPatientChartWithFiles({
      patientFileRepository: rig.repository,
    });

    // MedicalAlertBanner sits above everything and stays intact
    const medicalAlert = await view.findByRole('alert');
    expect(medicalAlert).toHaveTextContent('Severe Penicillin allergy');

    // Loading state displayed while listPatientFiles is pending
    expect(
      await view.findByText(en.patients.files.loadingTitle),
    ).toBeInTheDocument();

    // Synthetic files reminder uses role="note" (not role="alert")
    expect(view.getByRole('note')).toHaveTextContent(
      en.patients.files.syntheticNoticeTitle,
    );

    // Resolve to empty -> renders EmptyState
    resolveInitialFiles([]);
    expect(
      await view.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();
    view.unmount();

    // Error state with Retry recovery
    const errorRig = createInMemoryPatientFileRepository([]);
    errorRig.listPatientFiles.mockRejectedValueOnce(new Error('Storage error'));

    const errorView = renderPatientChartWithFiles({
      patientFileRepository: errorRig.repository,
    });

    expect(
      await errorView.findByText(en.patients.files.errors.listLoadTitle),
    ).toBeInTheDocument();

    await user.click(
      errorView.getByRole('button', { name: en.states.retry }),
    );

    expect(
      await errorView.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();
  });

  it('2. Rejects disallowed file types (.svg, .exe) and oversized files (> 10 MB) on the client without calling repository', async () => {
    const { uploadPatientFile } = renderPatientChartWithFiles({
      seedFiles: [],
    });

    expect(
      await screen.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();

    const fileInput = screen.getByLabelText(
      en.patients.files.uploadLabel,
    ) as HTMLInputElement;

    // Disallowed .svg file
    const svgFile = new File(['<svg></svg>'], 'diagram.svg', {
      type: 'image/svg+xml',
    });
    fireEvent.change(fileInput, { target: { files: [svgFile] } });

    expect(
      await screen.findByText(en.patients.files.validation.unsupportedMimeType),
    ).toBeInTheDocument();
    expect(uploadPatientFile).not.toHaveBeenCalled();

    // Disallowed .exe file
    const exeFile = new File(['MZ'], 'installer.exe', {
      type: 'application/x-msdownload',
    });
    fireEvent.change(fileInput, { target: { files: [exeFile] } });

    expect(
      await screen.findByText(en.patients.files.validation.unsupportedMimeType),
    ).toBeInTheDocument();
    expect(uploadPatientFile).not.toHaveBeenCalled();

    // Oversized file (> 10 MB)
    const oversizedFile = new File(['x'], 'huge-xray.jpg', {
      type: 'image/jpeg',
    });
    Object.defineProperty(oversizedFile, 'size', {
      value: PATIENT_FILE_MAX_SIZE_BYTES + 1,
    });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    expect(
      await screen.findByText(en.patients.files.validation.fileTooLarge),
    ).toBeInTheDocument();
    expect(uploadPatientFile).not.toHaveBeenCalled();
  });

  it('3. Uploads a valid synthetic image, renders preview with a temporary signed URL (never public URL), and refreshes signed URL on demand', async () => {
    const user = userEvent.setup();
    const { uploadPatientFile, createSignedFileUrl } =
      renderPatientChartWithFiles({ seedFiles: [] });

    expect(
      await screen.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();

    const fileInput = screen.getByLabelText(en.patients.files.uploadLabel);
    const validPng = new File(['synthetic-png-bytes'], 'synthetic-bitewing.png', {
      type: 'image/png',
    });

    await user.upload(fileInput, validPng);

    await waitFor(() => {
      expect(uploadPatientFile).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(en.patients.files.uploadSuccessTitle),
    ).toBeInTheDocument();
    expect(screen.getByText('synthetic-bitewing.png')).toBeInTheDocument();

    // Preview image uses the temporary signed URL
    const previewImg = await screen.findByRole('img', {
      name: en.patients.files.card.imagePreviewAlt.replace(
        '{name}',
        'synthetic-bitewing.png',
      ),
    });
    const initialSrc = previewImg.getAttribute('src') ?? '';
    expect(initialSrc).toContain('/object/sign/patient-files/');
    expect(initialSrc).toContain('?token=');
    expect(initialSrc).not.toContain('/object/public/');

    // Open / View anchor opens securely in a new tab with rel="noopener noreferrer"
    const openLink = screen.getByRole('link', {
      name: en.patients.files.card.openButton,
    });
    expect(openLink).toHaveAttribute('href', initialSrc);
    expect(openLink).toHaveAttribute('target', '_blank');
    expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Refresh link requests a new temporary signed URL
    await user.click(
      screen.getByRole('button', {
        name: en.patients.files.card.refreshLinkButton,
      }),
    );

    await waitFor(() => {
      expect(createSignedFileUrl).toHaveBeenCalledTimes(2);
    });
    expect(previewImg.getAttribute('src')).not.toBe(initialSrc);
  });

  it('4. Handles very long filenames cleanly (Overflow) and requires explicit inline UI confirmation before archiving', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');

    const veryLongFileName =
      `Synthetic_Panoramic_XRay_${'UpperArchLeftMolarSeries_'.repeat(5)}2026.pdf`;

    const seededPdf: PatientFileRecord = Object.freeze({
      id: '55555555-5555-4555-8555-555555555555',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/55555555-5555-4555-8555-555555555555.pdf`,
      fileName: veryLongFileName,
      mimeType: 'application/pdf',
      fileSizeBytes: 2_621_440,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: '2026-11-26T10:15:00Z',
    });

    const { archivePatientFile } = renderPatientChartWithFiles({
      seedFiles: [seededPdf],
    });

    const fileNameEl = await screen.findByText(veryLongFileName);
    expect(fileNameEl.className).toContain('truncate');
    expect(fileNameEl.className).toContain('break-words');
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('2.5 MB')).toBeInTheDocument();

    // Open archive confirmation inline (never window.confirm)
    await user.click(
      screen.getByRole('button', { name: en.patients.files.card.archiveButton }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(archivePatientFile).not.toHaveBeenCalled();

    const confirmRegion = screen.getByRole('region', {
      name: en.patients.files.archiveConfirm.title,
    });
    expect(confirmRegion).toBeInTheDocument();

    // Cancel keeps file visible
    await user.click(
      within(confirmRegion).getByRole('button', {
        name: en.patients.files.archiveConfirm.cancelButton,
      }),
    );
    expect(screen.getByText(veryLongFileName)).toBeInTheDocument();

    // Confirm archive removes file from gallery and calls repository
    await user.click(
      screen.getByRole('button', { name: en.patients.files.card.archiveButton }),
    );
    await user.click(
      screen.getByRole('button', {
        name: en.patients.files.archiveConfirm.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(archivePatientFile).toHaveBeenCalledWith(seededPdf.id);
    });

    expect(
      await screen.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('5. Switches cleanly between EN and ES for clinical files gallery labels, sizes, and dates', async () => {
    const user = userEvent.setup();

    const seededImage: PatientFileRecord = Object.freeze({
      id: '66666666-6666-4666-8666-666666666666',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/66666666-6666-4666-8666-666666666666.jpg`,
      fileName: 'intraoral-synthetic.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 1_536,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: '2026-11-26T10:15:00Z',
    });

    renderPatientChartWithFiles({
      initialLocale: 'en',
      seedFiles: [seededImage],
    });

    expect(await screen.findByText(en.patients.files.title)).toBeInTheDocument();
    expect(await screen.findByText('1.5 KB')).toBeInTheDocument();
    expect(
      screen.getByText(
        en.patients.files.card.uploadedOn.replace('{date}', '2026-11-26'),
      ),
    ).toBeInTheDocument();

    // Switch to Spanish
    await user.click(
      screen.getByRole('button', { name: en.language.switchToEs }),
    );

    expect(screen.getByText(es.patients.files.title)).toBeInTheDocument();
    expect(screen.getByText('1,5 KB')).toBeInTheDocument();
    expect(
      screen.getByText(
        es.patients.files.card.uploadedOn.replace('{date}', '26/11/2026'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: es.patients.files.uploadButton }),
    ).toBeInTheDocument();
  });

  it('6. Respects "Keep original quality" checkbox and displays optimization savings in role="status" banner (T-06b)', async () => {
    const user = userEvent.setup();
    const optimizeSpy = vi.fn<IImageOptimizer['optimizeIfNeeded']>();

    optimizeSpy.mockImplementationOnce(async () => {
      const optimized = new File(['small-webp'], 'panoramic-optimized.webp', {
        type: 'image/webp',
      });
      Object.defineProperty(optimized, 'size', { value: 491_520 }); // 480 KB
      return Object.freeze({
        file: optimized,
        wasOptimized: true,
        originalSizeBytes: 4_404_019, // 4.2 MB
        finalSizeBytes: 491_520,
      });
    });

    optimizeSpy.mockImplementationOnce(async (file) =>
      Object.freeze({
        file,
        wasOptimized: false,
        originalSizeBytes: file.size,
        finalSizeBytes: file.size,
      }),
    );

    const { uploadPatientFile } = renderPatientChartWithFiles({
      seedFiles: [],
      imageOptimizer: { optimizeIfNeeded: optimizeSpy },
    });

    expect(
      await screen.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();

    const preserveCheckbox = screen.getByLabelText(
      en.patients.files.optimization.preserveOriginalLabel,
    );
    expect(preserveCheckbox).not.toBeChecked();

    const fileInput = screen.getByLabelText(en.patients.files.uploadLabel);
    const largePhoto = new File(['raw-large-jpeg'], 'large-intraoral.jpg', {
      type: 'image/jpeg',
    });
    Object.defineProperty(largePhoto, 'size', { value: 4_404_019 });

    fireEvent.change(fileInput, { target: { files: [largePhoto] } });

    await waitFor(() => {
      expect(optimizeSpy).toHaveBeenCalledWith(largePhoto, {
        preserveOriginalQuality: false,
      });
      expect(uploadPatientFile).toHaveBeenCalledTimes(1);
    });

    const statusBanner = await screen.findByRole('status');
    expect(statusBanner).toHaveTextContent(en.patients.files.uploadSuccessTitle);
    expect(statusBanner).toHaveTextContent('4.2 MB');
    expect(statusBanner).toHaveTextContent('480 KB');

    // Now check "Keep original quality" -> passes preserveOriginalQuality: true
    await user.click(preserveCheckbox);
    expect(preserveCheckbox).toBeChecked();

    const xrayPhoto = new File(['raw-xray-png'], 'synthetic-xray.png', {
      type: 'image/png',
    });
    fireEvent.change(fileInput, { target: { files: [xrayPhoto] } });

    await waitFor(() => {
      expect(optimizeSpy).toHaveBeenLastCalledWith(xrayPhoto, {
        preserveOriginalQuality: true,
      });
    });
  });

  it('7. Replace button uploads new file FIRST and only archives previous file on success; failed replacement keeps previous file intact (T-06b)', async () => {
    const initialFile: PatientFileRecord = Object.freeze({
      id: '77777777-7777-4777-8777-777777777771',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/77777777-7777-4777-8777-777777777771.jpg`,
      fileName: 'old-intraoral.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 51_200,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: '2026-11-26T08:00:00Z',
    });

    const callOrder: string[] = [];
    const rig = createInMemoryPatientFileRepository([initialFile]);
    const originalUpload = rig.uploadPatientFile.getMockImplementation()!;
    const originalArchive = rig.archivePatientFile.getMockImplementation()!;

    rig.uploadPatientFile.mockImplementation(async (params) => {
      callOrder.push('upload');
      return originalUpload(params);
    });
    rig.archivePatientFile.mockImplementation(async (fileId) => {
      callOrder.push('archive');
      return originalArchive(fileId);
    });

    renderPatientChartWithFiles({ patientFileRepository: rig.repository });

    expect(await screen.findByText('old-intraoral.jpg')).toBeInTheDocument();

    const replaceInput = screen.getByLabelText(
      en.patients.files.replace.inputAria.replace('{name}', 'old-intraoral.jpg'),
    );

    // 7a. Failed replacement upload -> archivePatientFile is NOT called and old file stays visible
    rig.uploadPatientFile.mockRejectedValueOnce(new Error('Upload timeout'));
    const failedReplacement = new File(['bad-attempt'], 'replacement-fail.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(replaceInput, { target: { files: [failedReplacement] } });

    expect(
      await screen.findByText(en.patients.files.replace.errorTitle),
    ).toBeInTheDocument();
    expect(rig.archivePatientFile).not.toHaveBeenCalled();
    expect(screen.getByText('old-intraoral.jpg')).toBeInTheDocument();

    // 7b. Successful replacement -> uploads first, then archives previous file
    callOrder.length = 0;
    const validReplacement = new File(['new-sharp-photo'], 'new-intraoral.webp', {
      type: 'image/webp',
    });
    fireEvent.change(replaceInput, { target: { files: [validReplacement] } });

    await waitFor(() => {
      expect(callOrder).toEqual(['upload', 'archive']);
    });
    expect(rig.archivePatientFile).toHaveBeenCalledWith(initialFile.id);
    expect(await screen.findByText('new-intraoral.webp')).toBeInTheDocument();
    expect(screen.queryByText('old-intraoral.jpg')).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      en.patients.files.replace.successTitle,
    );
  });

  it('8. Shows "Delete upload mistake" ONLY for uploader own file within 15 min, hides for > 15 min or other colleague, and calls purgeMistakenUpload on confirmation (T-06b)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');

    const nowMs = Date.now();
    const recentOwnFile: PatientFileRecord = Object.freeze({
      id: '88888888-8888-4888-8888-000000000001',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/88888888-8888-4888-8888-000000000001.jpg`,
      fileName: 'mistake-recent-own.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 12_000,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
    });

    const oldOwnFile: PatientFileRecord = Object.freeze({
      id: '88888888-8888-4888-8888-000000000002',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/88888888-8888-4888-8888-000000000002.jpg`,
      fileName: 'old-own-file.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 12_000,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: new Date(nowMs - 20 * 60 * 1000).toISOString(),
    });

    const recentColleagueFile: PatientFileRecord = Object.freeze({
      id: '88888888-8888-4888-8888-000000000003',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/88888888-8888-4888-8888-000000000003.jpg`,
      fileName: 'recent-colleague-file.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 12_000,
      uploadedBy: '99999999-9999-4999-8999-999999999999',
      createdAt: new Date(nowMs - 1 * 60 * 1000).toISOString(),
    });

    const { purgeMistakenUpload } = renderPatientChartWithFiles({
      role: 'receptionist',
      seedFiles: [recentOwnFile, oldOwnFile, recentColleagueFile],
    });

    expect(
      await screen.findByText('mistake-recent-own.jpg'),
    ).toBeInTheDocument();

    // Only ONE "Delete upload mistake" button rendered across all 3 cards (strictly on recentOwnFile)
    const selfPurgeButtons = screen.getAllByRole('button', {
      name: en.patients.files.selfPurge.button,
    });
    expect(selfPurgeButtons).toHaveLength(1);

    const recentCard = screen
      .getByText('mistake-recent-own.jpg')
      .closest('article')!;
    const oldCard = screen.getByText('old-own-file.jpg').closest('article')!;
    const colleagueCard = screen
      .getByText('recent-colleague-file.jpg')
      .closest('article')!;

    expect(
      within(oldCard).queryByRole('button', {
        name: en.patients.files.selfPurge.button,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(colleagueCard).queryByRole('button', {
        name: en.patients.files.selfPurge.button,
      }),
    ).not.toBeInTheDocument();

    // Click and confirm inline (no window.confirm)
    await user.click(
      within(recentCard).getByRole('button', {
        name: en.patients.files.selfPurge.button,
      }),
    );
    expect(purgeMistakenUpload).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    const confirmRegion = within(recentCard).getByRole('region', {
      name: en.patients.files.selfPurge.confirmTitle,
    });
    await user.click(
      within(confirmRegion).getByRole('button', {
        name: en.patients.files.selfPurge.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(purgeMistakenUpload).toHaveBeenCalledWith(
        recentOwnFile.id,
        recentOwnFile.storagePath,
      );
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByText('mistake-recent-own.jpg'),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      en.patients.files.selfPurge.successTitle,
    );

    confirmSpy.mockRestore();
  });

  it('9. Allows admin to open Archived files tab, restore one file, and permanently purge another with explicit confirmation; hides Archived tab from dentist (T-06b)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');

    const archivedToRestore: ArchivedPatientFileRecord = Object.freeze({
      id: '99999999-9999-4999-8999-000000000001',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/99999999-9999-4999-8999-000000000001.png`,
      fileName: 'archived-restore.png',
      mimeType: 'image/png',
      fileSizeBytes: 64_000,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: '2026-11-25T10:00:00Z',
      deletedAt: '2026-11-26T10:00:00Z',
    });

    const archivedToPurge: ArchivedPatientFileRecord = Object.freeze({
      id: '99999999-9999-4999-8999-000000000002',
      clinicId: SYNTHETIC_CLINIC.id,
      patientId: SYNTHETIC_PATIENT.id,
      appointmentId: null,
      storagePath: `${SYNTHETIC_CLINIC.id}/${SYNTHETIC_PATIENT.id}/99999999-9999-4999-8999-000000000002.pdf`,
      fileName: 'archived-purge.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 128_000,
      uploadedBy: SYNTHETIC_USER.id,
      createdAt: '2026-11-25T11:00:00Z',
      deletedAt: '2026-11-26T11:00:00Z',
    });

    // Dentist does NOT see Archived tab
    const dentistView = renderPatientChartWithFiles({
      role: 'dentist',
      seedFiles: [],
      seedArchivedFiles: [archivedToRestore, archivedToPurge],
    });
    expect(
      await dentistView.findByText(en.patients.files.emptyTitle),
    ).toBeInTheDocument();
    expect(
      dentistView.queryByRole('tab', { name: en.patients.files.tabs.archived }),
    ).not.toBeInTheDocument();
    dentistView.unmount();

    // Admin sees Archived tab, restores archivedToRestore, and permanently deletes archivedToPurge
    const { restorePatientFile, purgeArchivedPatientFile } =
      renderPatientChartWithFiles({
        role: 'admin',
        seedFiles: [],
        seedArchivedFiles: [archivedToRestore, archivedToPurge],
      });

    const archivedTab = await screen.findByRole('tab', {
      name: en.patients.files.tabs.archived,
    });
    await user.click(archivedTab);

    expect(
      await screen.findByText('archived-restore.png'),
    ).toBeInTheDocument();
    expect(screen.getByText('archived-purge.pdf')).toBeInTheDocument();

    // 9a. Restore archivedToRestore
    const restoreCard = screen
      .getByText('archived-restore.png')
      .closest('article')!;
    await user.click(
      within(restoreCard).getByRole('button', {
        name: en.patients.files.archived.restoreButton,
      }),
    );
    expect(restorePatientFile).not.toHaveBeenCalled();

    const restoreConfirm = within(restoreCard).getByRole('region', {
      name: en.patients.files.archived.restoreConfirm.title,
    });
    await user.click(
      within(restoreConfirm).getByRole('button', {
        name: en.patients.files.archived.restoreConfirm.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(restorePatientFile).toHaveBeenCalledWith(archivedToRestore.id);
    });
    expect(
      screen.queryByText('archived-restore.png'),
    ).not.toBeInTheDocument();

    // 9b. Permanently purge archivedToPurge
    const purgeCard = screen
      .getByText('archived-purge.pdf')
      .closest('article')!;
    await user.click(
      within(purgeCard).getByRole('button', {
        name: en.patients.files.archived.purgeButton,
      }),
    );
    expect(purgeArchivedPatientFile).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();

    const purgeConfirm = within(purgeCard).getByRole('region', {
      name: en.patients.files.archived.purgeConfirm.title,
    });
    await user.click(
      within(purgeConfirm).getByRole('button', {
        name: en.patients.files.archived.purgeConfirm.confirmButton,
      }),
    );

    await waitFor(() => {
      expect(purgeArchivedPatientFile).toHaveBeenCalledWith(
        archivedToPurge.id,
        archivedToPurge.storagePath,
      );
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(
      await screen.findByText(en.patients.files.archived.emptyTitle),
    ).toBeInTheDocument();

    // Switch back to Active tab -> restored file is active again
    await user.click(
      screen.getByRole('tab', { name: en.patients.files.tabs.active }),
    );
    expect(
      await screen.findByText('archived-restore.png'),
    ).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
