import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  normalizeLocale,
  resolveInitialLocale,
} from './locale';

describe('locale domain utilities', () => {
  it('validates supported locales strictly', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('normalizes regional tags and falls back to default locale', () => {
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale('ES_AR')).toBe('es');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fr-FR')).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE);
  });

  it('gives priority to persisted locale over browser locale', () => {
    expect(resolveInitialLocale('es', 'en-US')).toBe('es');
    expect(resolveInitialLocale('en', 'es-ES')).toBe('en');
  });

  it('falls back to navigator locale when persisted locale is missing or invalid', () => {
    expect(resolveInitialLocale(null, 'es-MX')).toBe('es');
    expect(resolveInitialLocale('de', 'es-ES')).toBe('es');
    expect(resolveInitialLocale('de', 'fr-FR')).toBe(DEFAULT_LOCALE);
  });
});
