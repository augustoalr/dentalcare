import { isSupportedLocale, type SupportedLocale } from '@/domain/locale';

export const MAX_TAX_RATE_BPS = 10_000;
export const CLINIC_NAME_MAX_LENGTH = 120;
export const CURRENCY_SYMBOL_MAX_LENGTH = 10;
export const TAX_LABEL_MAX_LENGTH = 20;
export const TIMEZONE_MAX_LENGTH = 64;
export const PREVIEW_SAMPLE_SUBTOTAL_CENTS = 10_000;

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const PERCENT_INPUT_PATTERN = /^(\d+)(?:[.,](\d{1,2}))?$/;
const TRAILING_ALPHANUMERIC_OR_DOT_PATTERN = /[\p{L}\p{N}.]$/u;

export interface CurrencyDisplayConfig {
  readonly currencyCode: string;
  readonly currencySymbol: string;
}

export interface ClinicSettingsInput {
  readonly name: string;
  readonly currencyCode: string;
  readonly currencySymbol: string;
  readonly taxRateBps: number;
  readonly taxLabel: string;
  readonly timezone: string;
  readonly defaultLocale: SupportedLocale;
}

export type ClinicSettingsPresetId = 'uae' | 'spain' | 'usa';

export type ClinicSettingsPresetLabelKey =
  | 'settings.presets.uae'
  | 'settings.presets.spain'
  | 'settings.presets.usa';

export interface ClinicSettingsPreset {
  readonly id: ClinicSettingsPresetId;
  readonly labelKey: ClinicSettingsPresetLabelKey;
  readonly currencyCode: string;
  readonly currencySymbol: string;
  readonly taxRateBps: number;
  readonly taxLabel: string;
  readonly timezone: string;
  readonly defaultLocale: SupportedLocale;
}

export const CLINIC_SETTINGS_PRESETS: readonly ClinicSettingsPreset[] =
  Object.freeze([
    Object.freeze({
      id: 'uae',
      labelKey: 'settings.presets.uae',
      currencyCode: 'AED',
      currencySymbol: 'AED',
      taxRateBps: 500,
      taxLabel: 'VAT',
      timezone: 'Asia/Dubai',
      defaultLocale: 'en',
    }),
    Object.freeze({
      id: 'spain',
      labelKey: 'settings.presets.spain',
      currencyCode: 'EUR',
      currencySymbol: '€',
      taxRateBps: 2100,
      taxLabel: 'IVA',
      timezone: 'Europe/Madrid',
      defaultLocale: 'es',
    }),
    Object.freeze({
      id: 'usa',
      labelKey: 'settings.presets.usa',
      currencyCode: 'USD',
      currencySymbol: '$',
      taxRateBps: 0,
      taxLabel: 'Tax',
      timezone: 'America/New_York',
      defaultLocale: 'en',
    }),
  ]);

export const COMMON_CLINIC_TIMEZONES: readonly string[] = Object.freeze([
  'Asia/Dubai',
  'Europe/Madrid',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Argentina/Buenos_Aires',
  'UTC',
]);

export interface TaxSummaryCents {
  readonly subtotalCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
}

export interface RawClinicSettingsInput {
  readonly name: string;
  readonly currencyCode: string;
  readonly currencySymbol: string;
  readonly taxRateBps: number | null;
  readonly taxLabel: string;
  readonly timezone: string;
  readonly defaultLocale: string;
}

export type NameValidationErrorCode = 'name_required' | 'name_too_long';
export type CurrencyCodeValidationErrorCode =
  | 'currency_code_required'
  | 'currency_code_invalid';
export type CurrencySymbolValidationErrorCode =
  | 'currency_symbol_required'
  | 'currency_symbol_too_long';
export type TaxRateValidationErrorCode = 'tax_rate_invalid';
export type TaxLabelValidationErrorCode =
  | 'tax_label_required'
  | 'tax_label_too_long';
export type TimezoneValidationErrorCode =
  | 'timezone_required'
  | 'timezone_too_long';
export type DefaultLocaleValidationErrorCode = 'default_locale_invalid';

export interface ClinicSettingsFieldErrors {
  readonly name: NameValidationErrorCode | null;
  readonly currencyCode: CurrencyCodeValidationErrorCode | null;
  readonly currencySymbol: CurrencySymbolValidationErrorCode | null;
  readonly taxRateBps: TaxRateValidationErrorCode | null;
  readonly taxLabel: TaxLabelValidationErrorCode | null;
  readonly timezone: TimezoneValidationErrorCode | null;
  readonly defaultLocale: DefaultLocaleValidationErrorCode | null;
}

export type ClinicSettingsValidationResult =
  | {
      readonly valid: true;
      readonly value: ClinicSettingsInput;
      readonly errors: ClinicSettingsFieldErrors;
    }
  | {
      readonly valid: false;
      readonly value: null;
      readonly errors: ClinicSettingsFieldErrors;
    };

function groupThousands(digits: string, separator: string): string {
  if (digits.length <= 3) {
    return digits;
  }

  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    const start = Math.max(0, end - 3);
    groups.push(digits.slice(start, end));
  }

  return groups.reverse().join(separator);
}

function assertValidTaxRateBps(taxRateBps: number): void {
  if (
    !Number.isSafeInteger(taxRateBps) ||
    taxRateBps < 0 ||
    taxRateBps > MAX_TAX_RATE_BPS
  ) {
    throw new RangeError(
      `taxRateBps must be a safe integer between 0 and ${MAX_TAX_RATE_BPS}`,
    );
  }
}

/**
 * Formats an integer amount in cents without floating-point division drift.
 * Uses locale-specific separators (`en`: `1,250.00`, `es`: `1.250,00`), prepends `-`
 * on negative amounts, and combines `currencySymbol` cleanly (e.g. `AED 1,250.00`,
 * `€1.250,00`, `$1,250.00`).
 */
export function formatMoney(
  amountCents: number,
  config: CurrencyDisplayConfig,
  locale: SupportedLocale,
): string {
  if (!Number.isSafeInteger(amountCents)) {
    throw new RangeError('amountCents must be a safe integer');
  }

  const normalizedCents = amountCents === 0 ? 0 : amountCents;
  const isNegative = normalizedCents < 0;
  const rawBig = BigInt(normalizedCents);
  const absCents = rawBig < 0n ? -rawBig : rawBig;

  const wholeUnits = absCents / 100n;
  const remainderCents = absCents % 100n;

  const thousandsSeparator = locale === 'es' ? '.' : ',';
  const decimalSeparator = locale === 'es' ? ',' : '.';

  const formattedWhole = groupThousands(
    wholeUnits.toString(),
    thousandsSeparator,
  );
  const formattedCents = remainderCents.toString().padStart(2, '0');
  const formattedMagnitude = `${formattedWhole}${decimalSeparator}${formattedCents}`;

  const sign = isNegative ? '-' : '';
  const symbol = config.currencySymbol.trim() || config.currencyCode.trim();

  if (symbol.length === 0) {
    return `${sign}${formattedMagnitude}`;
  }

  const requiresSpace = TRAILING_ALPHANUMERIC_OR_DOT_PATTERN.test(symbol);
  return requiresSpace
    ? `${sign}${symbol} ${formattedMagnitude}`
    : `${sign}${symbol}${formattedMagnitude}`;
}

/**
 * Calculates exact integer tax cents from integer `subtotalCents` and `taxRateBps`
 * (`0..10000`, where `500` = `5.00%` and `2100` = `21.00%`) using `BigInt` symmetric
 * half-up rounding without floating-point arithmetic.
 */
export function calculateTaxCents(
  subtotalCents: number,
  taxRateBps: number,
): number {
  if (!Number.isSafeInteger(subtotalCents)) {
    throw new RangeError('subtotalCents must be a safe integer');
  }
  assertValidTaxRateBps(taxRateBps);

  if (subtotalCents === 0 || taxRateBps === 0) {
    return 0;
  }

  const isNegative = subtotalCents < 0;
  const rawBig = BigInt(subtotalCents);
  const absSubtotal = rawBig < 0n ? -rawBig : rawBig;

  const absTax = (absSubtotal * BigInt(taxRateBps) + 5000n) / 10000n;
  const signedTax = isNegative ? -absTax : absTax;
  const result = Number(signedTax);

  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Calculated taxCents exceeds safe integer range');
  }

  return result === 0 ? 0 : result;
}

/**
 * Computes an immutable `{ subtotalCents, taxCents, totalCents }` breakdown in integer cents.
 */
export function calculateTaxSummaryCents(
  subtotalCents: number,
  taxRateBps: number,
): TaxSummaryCents {
  const taxCents = calculateTaxCents(subtotalCents, taxRateBps);
  const normalizedSubtotal = subtotalCents === 0 ? 0 : subtotalCents;
  const totalCents = normalizedSubtotal + taxCents;

  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError('Calculated totalCents exceeds safe integer range');
  }

  return Object.freeze({
    subtotalCents: normalizedSubtotal,
    taxCents,
    totalCents: totalCents === 0 ? 0 : totalCents,
  });
}

/**
 * Parses a human percentage string (`"5"`, `"5.00"`, `"21"`, `"0"`, `"7.5"`, `"7,5"`, `"100"`)
 * into basis points (`0..10000`) using pure integer arithmetic. Returns `null` for blank,
 * negative, `> 100`, `> 2` decimal places, or malformed strings.
 */
export function percentStringToBps(rawPercent: string): number | null {
  const trimmed = rawPercent.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = PERCENT_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const wholePart = match[1] ?? '';
  const fracPart = match[2] ?? '';

  const significantWhole = wholePart.replace(/^0+/, '') || '0';
  if (significantWhole.length > 3) {
    return null;
  }

  const whole = Number.parseInt(significantWhole, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, '0'), 10);
  const bps = whole * 100 + frac;

  if (!Number.isSafeInteger(bps) || bps < 0 || bps > MAX_TAX_RATE_BPS) {
    return null;
  }

  return bps;
}

/**
 * Formats integer basis points (`0..10000`) as a clean percentage string
 * (`500` -> `"5"`, `525` -> `"5.25"`, `750` -> `"7.5"`, `0` -> `"0"`).
 */
export function bpsToPercentString(taxRateBps: number): string {
  assertValidTaxRateBps(taxRateBps);

  const whole = Math.trunc(taxRateBps / 100);
  const remainder = taxRateBps % 100;

  if (remainder === 0) {
    return String(whole);
  }

  const trimmedFraction = String(remainder).padStart(2, '0').replace(/0$/, '');
  return `${whole}.${trimmedFraction}`;
}

/**
 * Pure validation aligned 1:1 with PostgreSQL `public.clinics` CHECK constraints
 * plus safe upper bounds, returning typed field error codes and a normalized value.
 */
export function validateClinicSettings(
  raw: RawClinicSettingsInput,
): ClinicSettingsValidationResult {
  const normalizedName = raw.name.trim();
  const normalizedCurrencyCode = raw.currencyCode.trim().toUpperCase();
  const normalizedCurrencySymbol = raw.currencySymbol.trim();
  const normalizedTaxLabel = raw.taxLabel.trim();
  const normalizedTimezone = raw.timezone.trim();
  const normalizedLocaleCandidate = raw.defaultLocale.trim().toLowerCase();

  let nameError: NameValidationErrorCode | null = null;
  if (normalizedName.length === 0) {
    nameError = 'name_required';
  } else if (normalizedName.length > CLINIC_NAME_MAX_LENGTH) {
    nameError = 'name_too_long';
  }

  let currencyCodeError: CurrencyCodeValidationErrorCode | null = null;
  if (normalizedCurrencyCode.length === 0) {
    currencyCodeError = 'currency_code_required';
  } else if (!CURRENCY_CODE_PATTERN.test(normalizedCurrencyCode)) {
    currencyCodeError = 'currency_code_invalid';
  }

  let currencySymbolError: CurrencySymbolValidationErrorCode | null = null;
  if (normalizedCurrencySymbol.length === 0) {
    currencySymbolError = 'currency_symbol_required';
  } else if (normalizedCurrencySymbol.length > CURRENCY_SYMBOL_MAX_LENGTH) {
    currencySymbolError = 'currency_symbol_too_long';
  }

  const taxRateError: TaxRateValidationErrorCode | null =
    raw.taxRateBps === null ||
    !Number.isSafeInteger(raw.taxRateBps) ||
    raw.taxRateBps < 0 ||
    raw.taxRateBps > MAX_TAX_RATE_BPS
      ? 'tax_rate_invalid'
      : null;

  let taxLabelError: TaxLabelValidationErrorCode | null = null;
  if (normalizedTaxLabel.length === 0) {
    taxLabelError = 'tax_label_required';
  } else if (normalizedTaxLabel.length > TAX_LABEL_MAX_LENGTH) {
    taxLabelError = 'tax_label_too_long';
  }

  let timezoneError: TimezoneValidationErrorCode | null = null;
  if (normalizedTimezone.length === 0) {
    timezoneError = 'timezone_required';
  } else if (normalizedTimezone.length > TIMEZONE_MAX_LENGTH) {
    timezoneError = 'timezone_too_long';
  }

  const defaultLocaleError: DefaultLocaleValidationErrorCode | null =
    isSupportedLocale(normalizedLocaleCandidate)
      ? null
      : 'default_locale_invalid';

  const errors: ClinicSettingsFieldErrors = Object.freeze({
    name: nameError,
    currencyCode: currencyCodeError,
    currencySymbol: currencySymbolError,
    taxRateBps: taxRateError,
    taxLabel: taxLabelError,
    timezone: timezoneError,
    defaultLocale: defaultLocaleError,
  });

  if (
    nameError !== null ||
    currencyCodeError !== null ||
    currencySymbolError !== null ||
    taxRateError !== null ||
    taxLabelError !== null ||
    timezoneError !== null ||
    defaultLocaleError !== null ||
    raw.taxRateBps === null ||
    !isSupportedLocale(normalizedLocaleCandidate)
  ) {
    return Object.freeze({
      valid: false,
      value: null,
      errors,
    });
  }

  const value: ClinicSettingsInput = Object.freeze({
    name: normalizedName,
    currencyCode: normalizedCurrencyCode,
    currencySymbol: normalizedCurrencySymbol,
    taxRateBps: raw.taxRateBps,
    taxLabel: normalizedTaxLabel,
    timezone: normalizedTimezone,
    defaultLocale: normalizedLocaleCandidate,
  });

  return Object.freeze({
    valid: true,
    value,
    errors,
  });
}

/**
 * Pure structural equality check across all 7 configurable clinic fields.
 */
export function areClinicSettingsEqual(
  left: ClinicSettingsInput,
  right: ClinicSettingsInput,
): boolean {
  return (
    left.name === right.name &&
    left.currencyCode === right.currencyCode &&
    left.currencySymbol === right.currencySymbol &&
    left.taxRateBps === right.taxRateBps &&
    left.taxLabel === right.taxLabel &&
    left.timezone === right.timezone &&
    left.defaultLocale === right.defaultLocale
  );
}
