import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTHENTICATED_PATH,
  getNavigationItems,
  getRoleLabelKey,
  mapAuthErrorToCode,
  sanitizeReturnTo,
  validateLoginCredentials,
} from './auth';

describe('auth domain utilities', () => {
  describe('sanitizeReturnTo', () => {
    it('preserves valid internal clinic paths including search and hash', () => {
      expect(sanitizeReturnTo('/patients')).toBe('/patients');
      expect(sanitizeReturnTo('/schedule')).toBe('/schedule');
      expect(sanitizeReturnTo('/quotes?status=draft#summary')).toBe(
        '/quotes?status=draft#summary',
      );
      expect(sanitizeReturnTo('  /billing  ')).toBe('/billing');
    });

    it('falls back to /schedule for empty, root, or login loop paths', () => {
      expect(sanitizeReturnTo(null)).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('   ')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('/')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('/login')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('/login?from=/patients')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('/login/reset')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
    });

    it('blocks open-redirect payloads (protocol-relative, external URLs, backslashes, scripts)', () => {
      expect(sanitizeReturnTo('//evil.com')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('///evil.com/patients')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('https://evil.com')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('http://evil.com/schedule')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('/\\evil.com')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('\\evil.com')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('javascript:alert(1)')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('data:text/html,hello')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('/patients?redirect=https://evil.com')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
      expect(sanitizeReturnTo('patients')).toBe(DEFAULT_AUTHENTICATED_PATH);
      expect(sanitizeReturnTo('/patients\u0000')).toBe(
        DEFAULT_AUTHENTICATED_PATH,
      );
    });
  });

  describe('mapAuthErrorToCode', () => {
    it('maps invalid credentials errors without leaking raw provider messages', () => {
      expect(mapAuthErrorToCode({ code: 'invalid_credentials' })).toBe(
        'invalid_credentials',
      );
      expect(mapAuthErrorToCode(new Error('Invalid login credentials'))).toBe(
        'invalid_credentials',
      );
    });

    it('maps unconfirmed email, rate limit, session expired, and network errors', () => {
      expect(mapAuthErrorToCode({ code: 'email_not_confirmed' })).toBe(
        'email_not_confirmed',
      );
      expect(mapAuthErrorToCode({ status: 429 })).toBe('rate_limited');
      expect(mapAuthErrorToCode({ code: 'over_request_rate_limit' })).toBe(
        'rate_limited',
      );
      expect(mapAuthErrorToCode({ code: 'refresh_token_not_found' })).toBe(
        'session_expired',
      );
      expect(
        mapAuthErrorToCode({ name: 'AuthRetryableFetchError', status: 0 }),
      ).toBe('network_error');
      expect(mapAuthErrorToCode(new TypeError('Failed to fetch'))).toBe(
        'network_error',
      );
    });

    it('falls back to unknown for unexpected or missing errors', () => {
      expect(mapAuthErrorToCode(null)).toBe('unknown');
      expect(mapAuthErrorToCode(undefined)).toBe('unknown');
      expect(
        mapAuthErrorToCode(new Error('Internal upstream stack trace detail')),
      ).toBe('unknown');
    });
  });

  describe('validateLoginCredentials', () => {
    it('accepts valid email and non-empty password while normalizing email', () => {
      const result = validateLoginCredentials(
        '  Nur.AbouHarb@Clinic.Example ',
        'SyntheticPass!123',
      );

      expect(result).toEqual({
        valid: true,
        normalizedEmail: 'nur.abouharb@clinic.example',
        emailError: null,
        passwordError: null,
      });
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('returns typed validation error codes for missing or malformed fields', () => {
      expect(validateLoginCredentials('', '')).toEqual({
        valid: false,
        normalizedEmail: '',
        emailError: 'email_required',
        passwordError: 'password_required',
      });

      expect(validateLoginCredentials('invalid-email', '   ')).toEqual({
        valid: false,
        normalizedEmail: 'invalid-email',
        emailError: 'email_invalid',
        passwordError: 'password_required',
      });

      expect(validateLoginCredentials('doctor@clinic', 'ValidPass123')).toEqual(
        {
          valid: false,
          normalizedEmail: 'doctor@clinic',
          emailError: 'email_invalid',
          passwordError: null,
        },
      );
    });
  });

  describe('navigation and role helpers', () => {
    it('exposes the 6 immutable clinic sections in canonical order', () => {
      const items = getNavigationItems();
      expect(Object.isFrozen(items)).toBe(true);
      expect(items.map((item) => item.path)).toEqual([
        '/schedule',
        '/patients',
        '/treatments',
        '/quotes',
        '/billing',
        '/settings',
      ]);
    });

    it('maps internal roles to human translation keys', () => {
      expect(getRoleLabelKey('admin')).toBe('roles.admin');
      expect(getRoleLabelKey('dentist')).toBe('roles.dentist');
      expect(getRoleLabelKey('receptionist')).toBe('roles.receptionist');
    });
  });
});
