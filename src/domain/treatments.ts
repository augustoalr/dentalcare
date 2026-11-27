import type { SupportedLocale } from '@/domain/locale';
import { MAX_MONEY_AMOUNT_CENTS } from '@/domain/money';

export const TREATMENT_CODE_MAX_LENGTH = 32;
export const TREATMENT_NAME_MAX_LENGTH = 120;
export const TREATMENT_MIN_DURATION_MIN = 5;
export const TREATMENT_MAX_DURATION_MIN = 480;
export const TREATMENT_DEFAULT_DURATION_MIN = 30;

export const TREATMENT_CATEGORIES = Object.freeze([
  'preventive',
  'restorative',
  'endodontics',
  'periodontics',
  'orthodontics',
  'surgery',
  'prosthetics',
  'diagnostics',
  'aesthetics',
  'other',
] as const);

export type TreatmentCategory = (typeof TREATMENT_CATEGORIES)[number];
export type TreatmentCategoryFilter = 'all' | TreatmentCategory;

const TREATMENT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
const DURATION_INTEGER_PATTERN = /^\d+$/;
const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;

export interface TreatmentRecord {
  readonly id: string;
  readonly clinicId: string;
  readonly code: string;
  readonly nameEn: string;
  readonly nameEs: string;
  readonly category: TreatmentCategory;
  readonly defaultPriceCents: number;
  readonly defaultDurationMin: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArchivedTreatmentRecord extends TreatmentRecord {
  readonly deletedAt: string;
}

export interface TreatmentInput {
  readonly code: string;
  readonly nameEn: string;
  readonly nameEs: string;
  readonly category: TreatmentCategory;
  readonly defaultPriceCents: number;
  readonly defaultDurationMin: number;
  readonly isActive: boolean;
}

export interface RawTreatmentInput {
  readonly code: string;
  readonly nameEn: string;
  readonly nameEs: string;
  readonly category: string;
  readonly defaultPriceCents: number | null;
  readonly defaultDurationMin: number | null;
  readonly isActive: boolean;
}

export type TreatmentCodeErrorCode =
  | 'code_required'
  | 'code_too_long'
  | 'code_invalid';
export type TreatmentNameErrorCode = 'name_required' | 'name_too_long';
export type TreatmentCategoryErrorCode = 'category_invalid';
export type TreatmentPriceErrorCode = 'price_invalid';
export type TreatmentDurationErrorCode = 'duration_invalid';
export type TreatmentIsActiveErrorCode = 'is_active_invalid';

export interface TreatmentFieldErrors {
  readonly code: TreatmentCodeErrorCode | null;
  readonly nameEn: TreatmentNameErrorCode | null;
  readonly nameEs: TreatmentNameErrorCode | null;
  readonly category: TreatmentCategoryErrorCode | null;
  readonly defaultPriceCents: TreatmentPriceErrorCode | null;
  readonly defaultDurationMin: TreatmentDurationErrorCode | null;
  readonly isActive: TreatmentIsActiveErrorCode | null;
}

export type TreatmentValidationResult =
  | {
      readonly valid: true;
      readonly value: TreatmentInput;
      readonly errors: TreatmentFieldErrors;
    }
  | {
      readonly valid: false;
      readonly value: null;
      readonly errors: TreatmentFieldErrors;
    };

export interface TreatmentFilterOptions {
  readonly query: string;
  readonly category: TreatmentCategoryFilter;
  readonly includeInactive: boolean;
}

const TREATMENT_CATEGORY_SET: ReadonlySet<string> = new Set(TREATMENT_CATEGORIES);

function normalizeSearchToken(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS_PATTERN, '').toLowerCase();
}

/**
 * Pure runtime type guard verifying that `value` is one of the canonical
 * PostgreSQL `public.treatments_catalog.category` values.
 */
export function isTreatmentCategory(value: string): value is TreatmentCategory {
  return TREATMENT_CATEGORY_SET.has(value);
}

/**
 * Parses a human integer duration string (in minutes) into a safe integer,
 * returning `null` for blank, decimal, negative, or non-numeric strings.
 */
export function parseDurationMinutesString(rawDuration: string): number | null {
  const trimmed = rawDuration.trim();
  if (trimmed.length === 0 || !DURATION_INTEGER_PATTERN.test(trimmed)) {
    return null;
  }

  const significant = trimmed.replace(/^0+/, '') || '0';
  if (significant.length > 6) {
    return null;
  }

  const parsed = Number.parseInt(significant, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Returns the localized display name (`nameEs` for Spanish, `nameEn` for English).
 */
export function getLocalizedTreatmentName(
  treatment: Pick<TreatmentRecord, 'nameEn' | 'nameEs'>,
  locale: SupportedLocale,
): string {
  return locale === 'es' ? treatment.nameEs : treatment.nameEn;
}

/**
 * Returns the alternate-language name to show as a subtle secondary label.
 */
export function getSecondaryTreatmentName(
  treatment: Pick<TreatmentRecord, 'nameEn' | 'nameEs'>,
  locale: SupportedLocale,
): string {
  return locale === 'es' ? treatment.nameEn : treatment.nameEs;
}

/**
 * Pure validation aligned 1:1 with PostgreSQL `public.treatments_catalog`
 * CHECK constraints, returning typed error codes only (zero hardcoded UI text).
 */
export function validateTreatmentInput(
  raw: RawTreatmentInput,
): TreatmentValidationResult {
  const normalizedCode = raw.code.trim().toUpperCase();
  const normalizedNameEn = raw.nameEn.trim();
  const normalizedNameEs = raw.nameEs.trim();
  const normalizedCategory = raw.category.trim().toLowerCase();

  let codeError: TreatmentCodeErrorCode | null = null;
  if (normalizedCode.length === 0) {
    codeError = 'code_required';
  } else if (normalizedCode.length > TREATMENT_CODE_MAX_LENGTH) {
    codeError = 'code_too_long';
  } else if (!TREATMENT_CODE_PATTERN.test(normalizedCode)) {
    codeError = 'code_invalid';
  }

  let nameEnError: TreatmentNameErrorCode | null = null;
  if (normalizedNameEn.length === 0) {
    nameEnError = 'name_required';
  } else if (normalizedNameEn.length > TREATMENT_NAME_MAX_LENGTH) {
    nameEnError = 'name_too_long';
  }

  let nameEsError: TreatmentNameErrorCode | null = null;
  if (normalizedNameEs.length === 0) {
    nameEsError = 'name_required';
  } else if (normalizedNameEs.length > TREATMENT_NAME_MAX_LENGTH) {
    nameEsError = 'name_too_long';
  }

  const categoryError: TreatmentCategoryErrorCode | null = isTreatmentCategory(
    normalizedCategory,
  )
    ? null
    : 'category_invalid';

  const priceError: TreatmentPriceErrorCode | null =
    raw.defaultPriceCents === null ||
    !Number.isSafeInteger(raw.defaultPriceCents) ||
    raw.defaultPriceCents < 0 ||
    raw.defaultPriceCents > MAX_MONEY_AMOUNT_CENTS
      ? 'price_invalid'
      : null;

  const durationError: TreatmentDurationErrorCode | null =
    raw.defaultDurationMin === null ||
    !Number.isSafeInteger(raw.defaultDurationMin) ||
    raw.defaultDurationMin < TREATMENT_MIN_DURATION_MIN ||
    raw.defaultDurationMin > TREATMENT_MAX_DURATION_MIN
      ? 'duration_invalid'
      : null;

  const isActiveError: TreatmentIsActiveErrorCode | null =
    typeof raw.isActive === 'boolean' ? null : 'is_active_invalid';

  const errors: TreatmentFieldErrors = Object.freeze({
    code: codeError,
    nameEn: nameEnError,
    nameEs: nameEsError,
    category: categoryError,
    defaultPriceCents: priceError,
    defaultDurationMin: durationError,
    isActive: isActiveError,
  });

  if (
    codeError !== null ||
    nameEnError !== null ||
    nameEsError !== null ||
    categoryError !== null ||
    priceError !== null ||
    durationError !== null ||
    isActiveError !== null ||
    !isTreatmentCategory(normalizedCategory) ||
    raw.defaultPriceCents === null ||
    raw.defaultDurationMin === null
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      errors,
    });
  }

  const value: TreatmentInput = Object.freeze({
    code: normalizedCode,
    nameEn: normalizedNameEn,
    nameEs: normalizedNameEs,
    category: normalizedCategory,
    defaultPriceCents: raw.defaultPriceCents === 0 ? 0 : raw.defaultPriceCents,
    defaultDurationMin: raw.defaultDurationMin,
    isActive: raw.isActive,
  });

  return Object.freeze({
    valid: true,
    value,
    errors,
  });
}

/**
 * Pure, immutable, accent- and case-insensitive filter across `code`, `nameEn`,
 * and `nameEs`, plus category and active/paused status.
 */
export function filterTreatments(
  treatments: readonly TreatmentRecord[],
  options: TreatmentFilterOptions,
): readonly TreatmentRecord[] {
  const trimmedQuery = options.query.trim();
  const normalizedQuery =
    trimmedQuery.length > 0 ? normalizeSearchToken(trimmedQuery) : '';

  const filtered = treatments.filter((treatment) => {
    if (!options.includeInactive && !treatment.isActive) {
      return false;
    }

    if (options.category !== 'all' && treatment.category !== options.category) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    return (
      normalizeSearchToken(treatment.code).includes(normalizedQuery) ||
      normalizeSearchToken(treatment.nameEn).includes(normalizedQuery) ||
      normalizeSearchToken(treatment.nameEs).includes(normalizedQuery)
    );
  });

  return Object.freeze(filtered);
}
