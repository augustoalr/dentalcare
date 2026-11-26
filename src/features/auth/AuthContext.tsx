import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  mapAuthErrorToCode,
  type AuthErrorCode,
  type AuthSessionUser,
  type AuthStatus,
} from '@/domain/auth';
import type { SupportedLocale } from '@/domain/locale';
import type { ClinicSettingsInput } from '@/domain/money';
import { useI18n } from '@/i18n';
import {
  createDefaultAuthService,
  type IAuthService,
} from '@/services/auth/authService';
import {
  createDefaultClinicAccessRepository,
  type ClinicSummary,
  type IClinicAccessRepository,
  type UserProfile,
} from '@/services/repositories/clinicAccessRepository';

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: AuthSessionUser | null;
  readonly profile: UserProfile | null;
  readonly clinic: ClinicSummary | null;
  readonly errorCode: AuthErrorCode | null;
  readonly isSigningIn: boolean;
  readonly isSigningOut: boolean;
  readonly localeSyncWarning: boolean;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  retrySessionLoad: () => Promise<void>;
  updateClinicSettings: (input: ClinicSettingsInput) => Promise<ClinicSummary>;
  clearError: () => void;
  dismissLocaleSyncWarning: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  authService?: IAuthService | null;
  clinicAccessRepository?: IClinicAccessRepository | null;
}

export function AuthProvider({
  children,
  authService,
  clinicAccessRepository,
}: AuthProviderProps) {
  const { syncLocale, subscribeLocaleChange } = useI18n();

  const resolvedAuthService = useMemo(
    () =>
      authService !== undefined ? authService : createDefaultAuthService(),
    [authService],
  );

  const resolvedRepository = useMemo(
    () =>
      clinicAccessRepository !== undefined
        ? clinicAccessRepository
        : createDefaultClinicAccessRepository(),
    [clinicAccessRepository],
  );

  const isConfigured = Boolean(resolvedAuthService && resolvedRepository);

  const [status, setStatus] = useState<AuthStatus>(() =>
    isConfigured ? 'loading' : 'unconfigured',
  );
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(() =>
    isConfigured ? null : 'unconfigured',
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [localeSyncWarning, setLocaleSyncWarning] = useState(false);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const manualSignOutRef = useRef(false);
  const signingInRef = useRef(false);
  const statusRef = useRef<AuthStatus>(status);
  const userRef = useRef<AuthSessionUser | null>(user);
  const profileRef = useRef<UserProfile | null>(profile);
  const clinicRef = useRef<ClinicSummary | null>(clinic);

  const commitIdentityState = useCallback(
    (next: {
      status: AuthStatus;
      user: AuthSessionUser | null;
      profile: UserProfile | null;
      clinic: ClinicSummary | null;
      errorCode: AuthErrorCode | null;
    }) => {
      statusRef.current = next.status;
      userRef.current = next.user;
      profileRef.current = next.profile;
      clinicRef.current = next.clinic;

      setStatus(next.status);
      setUser(next.user);
      setProfile(next.profile);
      setClinic(next.clinic);
      setErrorCode(next.errorCode);
    },
    [],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const hydrateWorkspaceForUser = useCallback(
    async (
      sessionUser: AuthSessionUser,
      requestId: number,
    ): Promise<boolean> => {
      if (!resolvedRepository) {
        return false;
      }

      try {
        const [loadedProfile, loadedClinic] = await Promise.all([
          resolvedRepository.getCurrentProfile(sessionUser.id),
          resolvedRepository.getActiveClinic(),
        ]);

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return false;
        }

        if (!loadedProfile || !loadedClinic) {
          commitIdentityState({
            status: 'profile_missing',
            user: sessionUser,
            profile: null,
            clinic: null,
            errorCode: 'profile_missing',
          });
          return false;
        }

        syncLocale(loadedProfile.preferredLocale);
        setLocaleSyncWarning(false);
        commitIdentityState({
          status: 'authenticated',
          user: sessionUser,
          profile: loadedProfile,
          clinic: loadedClinic,
          errorCode: null,
        });
        return true;
      } catch (err) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return false;
        }

        commitIdentityState({
          status: 'error',
          user: sessionUser,
          profile: null,
          clinic: null,
          errorCode: mapAuthErrorToCode(err),
        });
        return false;
      }
    },
    [commitIdentityState, resolvedRepository, syncLocale],
  );

  useEffect(() => {
    if (!resolvedAuthService || !resolvedRepository) {
      commitIdentityState({
        status: 'unconfigured',
        user: null,
        profile: null,
        clinic: null,
        errorCode: 'unconfigured',
      });
      return;
    }

    const requestId = ++requestIdRef.current;
    statusRef.current = 'loading';
    setStatus('loading');
    setErrorCode(null);

    void (async () => {
      try {
        const currentUser = await resolvedAuthService.getCurrentSession();
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        if (!currentUser) {
          commitIdentityState({
            status: 'unauthenticated',
            user: null,
            profile: null,
            clinic: null,
            errorCode: null,
          });
          return;
        }

        await hydrateWorkspaceForUser(currentUser, requestId);
      } catch (err) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        commitIdentityState({
          status: 'error',
          user: null,
          profile: null,
          clinic: null,
          errorCode: mapAuthErrorToCode(err),
        });
      }
    })();

    const unsubscribe = resolvedAuthService.onAuthStateChange(
      (event, nextUser) => {
        if (!isMountedRef.current) {
          return;
        }

        if (event === 'INITIAL_SESSION') {
          return;
        }

        if (event === 'SIGNED_OUT') {
          requestIdRef.current += 1;
          const wasAuthenticated = statusRef.current === 'authenticated';
          const wasAlreadyExpired = statusRef.current === 'session_expired';
          const wasManual = manualSignOutRef.current;

          setLocaleSyncWarning(false);

          if (!wasManual && (wasAuthenticated || wasAlreadyExpired)) {
            commitIdentityState({
              status: 'session_expired',
              user: null,
              profile: null,
              clinic: null,
              errorCode: 'session_expired',
            });
          } else {
            commitIdentityState({
              status: 'unauthenticated',
              user: null,
              profile: null,
              clinic: null,
              errorCode: null,
            });
          }
          return;
        }

        if (!nextUser) {
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (
            statusRef.current === 'authenticated' &&
            userRef.current?.id === nextUser.id
          ) {
            userRef.current = nextUser;
            setUser(nextUser);
          }
          return;
        }

        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          if (signingInRef.current) {
            return;
          }

          if (
            statusRef.current === 'authenticated' &&
            userRef.current?.id === nextUser.id
          ) {
            userRef.current = nextUser;
            setUser(nextUser);
            return;
          }

          const changeRequestId = ++requestIdRef.current;
          void hydrateWorkspaceForUser(nextUser, changeRequestId);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [
    commitIdentityState,
    hydrateWorkspaceForUser,
    resolvedAuthService,
    resolvedRepository,
  ]);

  useEffect(() => {
    if (!resolvedRepository) {
      return;
    }

    return subscribeLocaleChange((nextLocale: SupportedLocale) => {
      const activeProfile = profileRef.current;
      if (statusRef.current !== 'authenticated' || !activeProfile) {
        return;
      }

      const updatedProfile = Object.freeze({
        ...activeProfile,
        preferredLocale: nextLocale,
      });
      profileRef.current = updatedProfile;
      setLocaleSyncWarning(false);
      setProfile(updatedProfile);

      void resolvedRepository
        .updatePreferredLocale(activeProfile.id, nextLocale)
        .catch(() => {
          if (isMountedRef.current && statusRef.current === 'authenticated') {
            setLocaleSyncWarning(true);
          }
        });
    });
  }, [resolvedRepository, subscribeLocaleChange]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!resolvedAuthService || !resolvedRepository) {
        commitIdentityState({
          status: 'unconfigured',
          user: null,
          profile: null,
          clinic: null,
          errorCode: 'unconfigured',
        });
        return false;
      }

      const requestId = ++requestIdRef.current;
      signingInRef.current = true;
      setIsSigningIn(true);
      setErrorCode(null);

      try {
        const sessionUser = await resolvedAuthService.signInWithPassword(
          email,
          password,
        );

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return false;
        }

        return await hydrateWorkspaceForUser(sessionUser, requestId);
      } catch (err) {
        if (isMountedRef.current && requestId === requestIdRef.current) {
          commitIdentityState({
            status: 'unauthenticated',
            user: null,
            profile: null,
            clinic: null,
            errorCode: mapAuthErrorToCode(err),
          });
        }
        return false;
      } finally {
        signingInRef.current = false;
        if (isMountedRef.current) {
          setIsSigningIn(false);
        }
      }
    },
    [
      commitIdentityState,
      hydrateWorkspaceForUser,
      resolvedAuthService,
      resolvedRepository,
    ],
  );

  const signOut = useCallback(async (): Promise<void> => {
    requestIdRef.current += 1;
    manualSignOutRef.current = true;
    setIsSigningOut(true);

    try {
      if (resolvedAuthService) {
        await resolvedAuthService.signOut();
      }
    } catch {
      // Even if local storage cleanup reports an error, clear in-memory session state
      // so the user is never trapped inside an authenticated or broken view.
    } finally {
      const nextStatus: AuthStatus =
        resolvedAuthService && resolvedRepository
          ? 'unauthenticated'
          : 'unconfigured';

      // Synchronously update refs BEFORE resetting `manualSignOutRef` so any
      // delayed/asynchronous `SIGNED_OUT` event arriving before React re-renders
      // cannot misclassify a manual sign-out as `'session_expired'`.
      statusRef.current = nextStatus;
      userRef.current = null;
      profileRef.current = null;
      clinicRef.current = null;

      if (isMountedRef.current) {
        setUser(null);
        setProfile(null);
        setClinic(null);
        setErrorCode(nextStatus === 'unconfigured' ? 'unconfigured' : null);
        setLocaleSyncWarning(false);
        setStatus(nextStatus);
        setIsSigningOut(false);
      }
      manualSignOutRef.current = false;
    }
  }, [resolvedAuthService, resolvedRepository]);

  const retrySessionLoad = useCallback(async (): Promise<void> => {
    if (!resolvedAuthService || !resolvedRepository) {
      return;
    }

    const requestId = ++requestIdRef.current;
    statusRef.current = 'loading';
    setStatus('loading');
    setErrorCode(null);

    try {
      const currentUser =
        (await resolvedAuthService.getCurrentSession()) ?? userRef.current;
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      if (!currentUser) {
        commitIdentityState({
          status: 'unauthenticated',
          user: null,
          profile: null,
          clinic: null,
          errorCode: null,
        });
        return;
      }

      await hydrateWorkspaceForUser(currentUser, requestId);
    } catch (err) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      statusRef.current = 'error';
      setErrorCode(mapAuthErrorToCode(err));
      setStatus('error');
    }
  }, [
    commitIdentityState,
    hydrateWorkspaceForUser,
    resolvedAuthService,
    resolvedRepository,
  ]);

  const updateClinicSettings = useCallback(
    async (input: ClinicSettingsInput): Promise<ClinicSummary> => {
      const activeProfile = profileRef.current;
      const activeClinic = clinicRef.current;

      if (
        statusRef.current !== 'authenticated' ||
        !activeProfile ||
        !activeClinic ||
        !resolvedRepository
      ) {
        throw Object.assign(
          new Error('Clinic workspace is not authenticated'),
          { code: 'unauthenticated' },
        );
      }

      if (activeProfile.role !== 'admin') {
        throw Object.assign(
          new Error('Only clinic administrators can update clinic settings'),
          { code: 'forbidden' },
        );
      }

      const capturedRequestId = requestIdRef.current;
      const updatedClinic = await resolvedRepository.updateClinicSettings(
        activeClinic.id,
        input,
      );

      if (
        isMountedRef.current &&
        capturedRequestId === requestIdRef.current &&
        statusRef.current === 'authenticated'
      ) {
        clinicRef.current = updatedClinic;
        setClinic(updatedClinic);
      }

      return updatedClinic;
    },
    [resolvedRepository],
  );

  const clearError = useCallback(() => {
    setErrorCode(null);
  }, []);

  const dismissLocaleSyncWarning = useCallback(() => {
    setLocaleSyncWarning(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      clinic,
      errorCode,
      isSigningIn,
      isSigningOut,
      localeSyncWarning,
      signIn,
      signOut,
      retrySessionLoad,
      updateClinicSettings,
      clearError,
      dismissLocaleSyncWarning,
    }),
    [
      status,
      user,
      profile,
      clinic,
      errorCode,
      isSigningIn,
      isSigningOut,
      localeSyncWarning,
      signIn,
      signOut,
      retrySessionLoad,
      updateClinicSettings,
      clearError,
      dismissLocaleSyncWarning,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
