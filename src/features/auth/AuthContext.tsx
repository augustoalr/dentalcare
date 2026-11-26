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

  statusRef.current = status;
  userRef.current = user;
  profileRef.current = profile;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const hydrateWorkspaceForUser = useCallback(
    async (sessionUser: AuthSessionUser, requestId: number): Promise<boolean> => {
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
          setUser(sessionUser);
          setProfile(null);
          setClinic(null);
          setErrorCode('profile_missing');
          setStatus('profile_missing');
          return false;
        }

        syncLocale(loadedProfile.preferredLocale);
        setUser(sessionUser);
        setProfile(loadedProfile);
        setClinic(loadedClinic);
        setErrorCode(null);
        setLocaleSyncWarning(false);
        setStatus('authenticated');
        return true;
      } catch (err) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return false;
        }

        setUser(sessionUser);
        setProfile(null);
        setClinic(null);
        setErrorCode(mapAuthErrorToCode(err));
        setStatus('error');
        return false;
      }
    },
    [resolvedRepository, syncLocale],
  );

  useEffect(() => {
    if (!resolvedAuthService || !resolvedRepository) {
      setUser(null);
      setProfile(null);
      setClinic(null);
      setErrorCode('unconfigured');
      setStatus('unconfigured');
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setErrorCode(null);

    void (async () => {
      try {
        const currentUser = await resolvedAuthService.getCurrentSession();
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        if (!currentUser) {
          setUser(null);
          setProfile(null);
          setClinic(null);
          setErrorCode(null);
          setStatus('unauthenticated');
          return;
        }

        await hydrateWorkspaceForUser(currentUser, requestId);
      } catch (err) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setUser(null);
        setProfile(null);
        setClinic(null);
        setErrorCode(mapAuthErrorToCode(err));
        setStatus('error');
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
          const wasManual = manualSignOutRef.current;

          setUser(null);
          setProfile(null);
          setClinic(null);
          setLocaleSyncWarning(false);

          if (!wasManual && wasAuthenticated) {
            setErrorCode('session_expired');
            setStatus('session_expired');
          } else {
            setErrorCode(null);
            setStatus('unauthenticated');
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
  }, [hydrateWorkspaceForUser, resolvedAuthService, resolvedRepository]);

  useEffect(() => {
    if (!resolvedRepository) {
      return;
    }

    return subscribeLocaleChange((nextLocale: SupportedLocale) => {
      const activeProfile = profileRef.current;
      if (statusRef.current !== 'authenticated' || !activeProfile) {
        return;
      }

      setLocaleSyncWarning(false);
      setProfile((prev) =>
        prev
          ? Object.freeze({ ...prev, preferredLocale: nextLocale })
          : null,
      );

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
        setErrorCode('unconfigured');
        setStatus('unconfigured');
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
          setUser(null);
          setProfile(null);
          setClinic(null);
          setErrorCode(mapAuthErrorToCode(err));
          setStatus('unauthenticated');
        }
        return false;
      } finally {
        signingInRef.current = false;
        if (isMountedRef.current) {
          setIsSigningIn(false);
        }
      }
    },
    [hydrateWorkspaceForUser, resolvedAuthService, resolvedRepository],
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
      // Even on transient network failure during sign-out, clear local session state
      // so the user is never trapped in an authenticated or broken view.
    } finally {
      if (isMountedRef.current) {
        setUser(null);
        setProfile(null);
        setClinic(null);
        setErrorCode(null);
        setLocaleSyncWarning(false);
        setStatus(
          resolvedAuthService && resolvedRepository
            ? 'unauthenticated'
            : 'unconfigured',
        );
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
    setStatus('loading');
    setErrorCode(null);

    try {
      const currentUser =
        userRef.current ?? (await resolvedAuthService.getCurrentSession());
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setClinic(null);
        setStatus('unauthenticated');
        return;
      }

      await hydrateWorkspaceForUser(currentUser, requestId);
    } catch (err) {
      if (!isMountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setErrorCode(mapAuthErrorToCode(err));
      setStatus('error');
    }
  }, [hydrateWorkspaceForUser, resolvedAuthService, resolvedRepository]);

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
