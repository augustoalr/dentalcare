export type SupportedLocale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'es'] as const;

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const LOCALE_STORAGE_KEY = 'dentalcare.locale';

/**
 * Type guard that checks whether an arbitrary string is a supported locale.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

/**
 * Normalizes a BCP-47 language tag (e.g. "es-ES", "EN_US") into a supported locale,
 * falling back to `DEFAULT_LOCALE` when the input is missing or unsupported.
 */
export function normalizeLocale(rawLocale: string | null | undefined): SupportedLocale {
  if (!rawLocale) {
    return DEFAULT_LOCALE;
  }

  const normalized = rawLocale.trim().toLowerCase().split(/[-_]/)[0];
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  return DEFAULT_LOCALE;
}

/**
 * Resolves the initial locale giving priority to a previously persisted preference,
 * then to the browser/system language, and finally to `DEFAULT_LOCALE`.
 */
export function resolveInitialLocale(
  persistedLocale: string | null | undefined,
  navigatorLocale?: string | null,
): SupportedLocale {
  if (persistedLocale && persistedLocale.trim().length > 0) {
    const candidate = persistedLocale.trim().toLowerCase().split(/[-_]/)[0];
    if (isSupportedLocale(candidate)) {
      return candidate;
    }
  }

  return normalizeLocale(navigatorLocale);
}
