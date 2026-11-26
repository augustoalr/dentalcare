export interface AuthSessionUser {
  readonly id: string;
  readonly email: string | null;
}

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'session_expired'
  | 'unconfigured'
  | 'profile_missing'
  | 'error';

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network_error'
  | 'profile_missing'
  | 'session_expired'
  | 'unconfigured'
  | 'unknown';

export type AppRouteId =
  | 'schedule'
  | 'patients'
  | 'treatments'
  | 'quotes'
  | 'billing'
  | 'settings';

export type UserRole = 'admin' | 'dentist' | 'receptionist';

export type RoleLabelKey =
  | 'roles.admin'
  | 'roles.dentist'
  | 'roles.receptionist';

export type NavigationLabelKey =
  | 'nav.schedule'
  | 'nav.patients'
  | 'nav.treatments'
  | 'nav.quotes'
  | 'nav.billing'
  | 'nav.settings';

export type SectionTitleKey =
  | 'sections.schedule.title'
  | 'sections.patients.title'
  | 'sections.treatments.title'
  | 'sections.quotes.title'
  | 'sections.billing.title'
  | 'sections.settings.title';

export type SectionDescriptionKey =
  | 'sections.schedule.description'
  | 'sections.patients.description'
  | 'sections.treatments.description'
  | 'sections.quotes.description'
  | 'sections.billing.description'
  | 'sections.settings.description';

export interface NavigationItem {
  readonly id: AppRouteId;
  readonly path: `/${AppRouteId}`;
  readonly labelKey: NavigationLabelKey;
  readonly sectionTitleKey: SectionTitleKey;
  readonly sectionDescriptionKey: SectionDescriptionKey;
}

export type LoginValidationErrorCode =
  | 'email_required'
  | 'email_invalid'
  | 'password_required';

export interface LoginValidationResult {
  readonly valid: boolean;
  readonly normalizedEmail: string;
  readonly emailError: 'email_required' | 'email_invalid' | null;
  readonly passwordError: 'password_required' | null;
}

export const DEFAULT_AUTHENTICATED_PATH = '/schedule';

const INTERNAL_BASE_ORIGIN = 'https://dentalcare.internal';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORBIDDEN_PROTOCOL_PATTERN = /(?:https?|javascript|data|vbscript|file):/i;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = Object.freeze([
  Object.freeze({
    id: 'schedule',
    path: '/schedule',
    labelKey: 'nav.schedule',
    sectionTitleKey: 'sections.schedule.title',
    sectionDescriptionKey: 'sections.schedule.description',
  }),
  Object.freeze({
    id: 'patients',
    path: '/patients',
    labelKey: 'nav.patients',
    sectionTitleKey: 'sections.patients.title',
    sectionDescriptionKey: 'sections.patients.description',
  }),
  Object.freeze({
    id: 'treatments',
    path: '/treatments',
    labelKey: 'nav.treatments',
    sectionTitleKey: 'sections.treatments.title',
    sectionDescriptionKey: 'sections.treatments.description',
  }),
  Object.freeze({
    id: 'quotes',
    path: '/quotes',
    labelKey: 'nav.quotes',
    sectionTitleKey: 'sections.quotes.title',
    sectionDescriptionKey: 'sections.quotes.description',
  }),
  Object.freeze({
    id: 'billing',
    path: '/billing',
    labelKey: 'nav.billing',
    sectionTitleKey: 'sections.billing.title',
    sectionDescriptionKey: 'sections.billing.description',
  }),
  Object.freeze({
    id: 'settings',
    path: '/settings',
    labelKey: 'nav.settings',
    sectionTitleKey: 'sections.settings.title',
    sectionDescriptionKey: 'sections.settings.description',
  }),
]);

/**
 * Prevents open-redirect vulnerabilities by accepting only safe, relative internal paths.
 * Any external URL, protocol-relative path, backslash trick, control char, root `/`, or `/login`
 * falls back safely to `/schedule`.
 */
export function sanitizeReturnTo(rawPath: string | null | undefined): string {
  if (!rawPath) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  const trimmed = rawPath.trim();
  if (
    trimmed.length === 0 ||
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    hasControlCharacters(trimmed) ||
    FORBIDDEN_PROTOCOL_PATTERN.test(trimmed)
  ) {
    return DEFAULT_AUTHENTICATED_PATH;
  }

  try {
    const parsed = new URL(trimmed, INTERNAL_BASE_ORIGIN);
    if (parsed.origin !== INTERNAL_BASE_ORIGIN) {
      return DEFAULT_AUTHENTICATED_PATH;
    }

    if (
      parsed.pathname === '/' ||
      parsed.pathname === '/login' ||
      parsed.pathname.startsWith('/login/')
    ) {
      return DEFAULT_AUTHENTICATED_PATH;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_PATH;
  }
}

/**
 * Maps unknown errors from Auth/network providers into safe, typed domain codes
 * so internal technical details are never exposed directly in the UI (R-14).
 */
export function mapAuthErrorToCode(error: unknown): AuthErrorCode {
  if (!error) {
    return 'unknown';
  }

  const record =
    typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const rawCode =
    typeof record?.code === 'string' ? record.code.trim().toLowerCase() : '';
  const rawName =
    typeof record?.name === 'string' ? record.name.trim().toLowerCase() : '';
  const rawStatus = typeof record?.status === 'number' ? record.status : null;
  const rawMessage =
    typeof error === 'string'
      ? error.toLowerCase()
      : typeof record?.message === 'string'
        ? record.message.toLowerCase()
        : '';

  if (
    rawCode === 'invalid_credentials' ||
    rawCode === 'invalid_grant' ||
    rawMessage.includes('invalid login credentials') ||
    rawMessage.includes('invalid credentials')
  ) {
    return 'invalid_credentials';
  }

  if (
    rawCode === 'email_not_confirmed' ||
    rawMessage.includes('email not confirmed')
  ) {
    return 'email_not_confirmed';
  }

  if (
    rawStatus === 429 ||
    rawCode === 'over_request_rate_limit' ||
    rawCode === 'over_email_send_rate_limit' ||
    rawCode === 'rate_limited' ||
    rawCode === 'too_many_requests' ||
    rawMessage.includes('rate limit') ||
    rawMessage.includes('too many requests')
  ) {
    return 'rate_limited';
  }

  if (
    rawCode === 'session_expired' ||
    rawCode === 'session_not_found' ||
    rawCode === 'refresh_token_not_found' ||
    rawMessage.includes('jwt expired') ||
    rawMessage.includes('session expired')
  ) {
    return 'session_expired';
  }

  if (
    rawName === 'authretryablefetcherror' ||
    rawCode === 'network_error' ||
    rawStatus === 0 ||
    rawMessage.includes('failed to fetch') ||
    rawMessage.includes('networkerror') ||
    rawMessage.includes('network request failed') ||
    rawMessage.includes('fetch failed') ||
    rawMessage.includes('load failed')
  ) {
    return 'network_error';
  }

  if (rawCode === 'profile_missing') {
    return 'profile_missing';
  }

  if (rawCode === 'unconfigured') {
    return 'unconfigured';
  }

  return 'unknown';
}

/**
 * Pure client-side validation for login credentials returning typed error codes
 * rather than hardcoded UI strings.
 */
export function validateLoginCredentials(
  email: string,
  password: string,
): LoginValidationResult {
  const normalizedEmail = email.trim().toLowerCase();

  let emailError: 'email_required' | 'email_invalid' | null = null;
  if (normalizedEmail.length === 0) {
    emailError = 'email_required';
  } else if (
    normalizedEmail.length > 254 ||
    !EMAIL_PATTERN.test(normalizedEmail)
  ) {
    emailError = 'email_invalid';
  }

  const passwordError: 'password_required' | null =
    password.trim().length === 0 ? 'password_required' : null;

  return Object.freeze({
    valid: emailError === null && passwordError === null,
    normalizedEmail,
    emailError,
    passwordError,
  });
}

/**
 * Returns the immutable list of primary clinic navigation sections.
 */
export function getNavigationItems(): readonly NavigationItem[] {
  return NAVIGATION_ITEMS;
}

/**
 * Maps an internal database role to its human-readable translation key (R-14).
 */
export function getRoleLabelKey(role: UserRole): RoleLabelKey {
  switch (role) {
    case 'admin':
      return 'roles.admin';
    case 'dentist':
      return 'roles.dentist';
    case 'receptionist':
      return 'roles.receptionist';
  }
}
