import { describe, expect, it } from 'vitest';
import {
  areClinicSettingsEqual,
  bpsToPercentString,
  calculateTaxCents,
  calculateTaxSummaryCents,
  CLINIC_SETTINGS_PRESETS,
  formatMoney,
  percentStringToBps,
  validateClinicSettings,
  type CurrencyDisplayConfig,
} from './money';

const AED_CONFIG: CurrencyDisplayConfig = Object.freeze({
  currencyCode: 'AED',
  currencySymbol: 'AED',
});

const EUR_CONFIG: CurrencyDisplayConfig = Object.freeze({
  currencyCode: 'EUR',
  currencySymbol: '€',
});

const USD_CONFIG: CurrencyDisplayConfig = Object.freeze({
  currencyCode: 'USD',
  currencySymbol: '$',
});

describe('T-04 Pure money, tax (_bps) and multi-country clinic settings domain', () => {
  describe('formatMoney', () => {
    it('formats AED, EUR, and USD amounts accurately in both en and es locales', () => {
      expect(formatMoney(125_000, AED_CONFIG, 'en')).toBe('AED 1,250.00');
      expect(formatMoney(125_000, AED_CONFIG, 'es')).toBe('AED 1.250,00');

      expect(formatMoney(125_000, EUR_CONFIG, 'en')).toBe('€1,250.00');
      expect(formatMoney(125_000, EUR_CONFIG, 'es')).toBe('€1.250,00');

      expect(formatMoney(125_000, USD_CONFIG, 'en')).toBe('$1,250.00');
      expect(formatMoney(125_000, USD_CONFIG, 'es')).toBe('$1.250,00');
    });

    it('handles zero, -0, single-digit cents, negative amounts, and massive safe integers without float drift', () => {
      expect(formatMoney(0, AED_CONFIG, 'en')).toBe('AED 0.00');
      expect(formatMoney(-0, EUR_CONFIG, 'es')).toBe('€0,00');
      expect(formatMoney(5, USD_CONFIG, 'en')).toBe('$0.05');
      expect(formatMoney(99, EUR_CONFIG, 'es')).toBe('€0,99');

      expect(formatMoney(-125_050, AED_CONFIG, 'en')).toBe('-AED 1,250.50');
      expect(formatMoney(-125_050, EUR_CONFIG, 'es')).toBe('-€1.250,50');
      expect(formatMoney(-125_050, USD_CONFIG, 'en')).toBe('-$1,250.50');

      // Exact BigInt division at Number.MAX_SAFE_INTEGER (9,007,199,254,740,991 cents)
      expect(formatMoney(Number.MAX_SAFE_INTEGER, USD_CONFIG, 'en')).toBe(
        '$90,071,992,547,409.91',
      );
    });

    it('falls back to currencyCode when currencySymbol is blank and handles empty config safely', () => {
      expect(
        formatMoney(10_000, { currencyCode: 'AED', currencySymbol: '   ' }, 'en'),
      ).toBe('AED 100.00');
      expect(
        formatMoney(10_000, { currencyCode: '', currencySymbol: '' }, 'es'),
      ).toBe('100,00');
    });

    it('throws RangeError when amountCents is not a safe integer', () => {
      expect(() => formatMoney(12.5, AED_CONFIG, 'en')).toThrow(RangeError);
      expect(() => formatMoney(Number.NaN, EUR_CONFIG, 'es')).toThrow(RangeError);
      expect(() =>
        formatMoney(Number.POSITIVE_INFINITY, USD_CONFIG, 'en'),
      ).toThrow(RangeError);
      expect(() =>
        formatMoney(Number.MAX_SAFE_INTEGER + 1, USD_CONFIG, 'en'),
      ).toThrow(RangeError);
    });
  });

  describe('calculateTaxCents and calculateTaxSummaryCents', () => {
    it('calculates exact tax and immutable totals for AED (5% = 500 bps), EUR (21% = 2100 bps), and USD (0% = 0 bps)', () => {
      // AED 5% VAT on 1,250.00 (125,000 cents) -> 62.50 (6,250 cents) -> 1,312.50 (131,250 cents)
      const aedSummary = calculateTaxSummaryCents(125_000, 500);
      expect(Object.isFrozen(aedSummary)).toBe(true);
      expect(aedSummary).toEqual({
        subtotalCents: 125_000,
        taxCents: 6_250,
        totalCents: 131_250,
      });
      expect(formatMoney(aedSummary.totalCents, AED_CONFIG, 'en')).toBe(
        'AED 1,312.50',
      );
      expect(formatMoney(aedSummary.totalCents, AED_CONFIG, 'es')).toBe(
        'AED 1.312,50',
      );

      // EUR 21% IVA on 1,250.00 (125,000 cents) -> 262.50 (26,250 cents) -> 1,512.50 (151,250 cents)
      const eurSummary = calculateTaxSummaryCents(125_000, 2100);
      expect(Object.isFrozen(eurSummary)).toBe(true);
      expect(eurSummary).toEqual({
        subtotalCents: 125_000,
        taxCents: 26_250,
        totalCents: 151_250,
      });
      expect(formatMoney(eurSummary.totalCents, EUR_CONFIG, 'en')).toBe(
        '€1,512.50',
      );
      expect(formatMoney(eurSummary.totalCents, EUR_CONFIG, 'es')).toBe(
        '€1.512,50',
      );

      // USD 0% Tax on 1,250.00 (125,000 cents) -> 0.00 (0 cents) -> 1,250.00 (125,000 cents)
      const usdSummary = calculateTaxSummaryCents(125_000, 0);
      expect(Object.isFrozen(usdSummary)).toBe(true);
      expect(usdSummary).toEqual({
        subtotalCents: 125_000,
        taxCents: 0,
        totalCents: 125_000,
      });
      expect(formatMoney(usdSummary.totalCents, USD_CONFIG, 'en')).toBe(
        '$1,250.00',
      );
      expect(formatMoney(usdSummary.totalCents, USD_CONFIG, 'es')).toBe(
        '$1.250,00',
      );
    });

    it('applies exact symmetric half-up rounding and handles 0 and negative subtotals', () => {
      // 10 cents * 5% = 0.5 cents -> rounds half-up to 1 cent
      expect(calculateTaxCents(10, 500)).toBe(1);
      expect(calculateTaxCents(-10, 500)).toBe(-1);

      // 9 cents * 5% = 0.45 cents -> rounds down to 0 cents
      expect(calculateTaxCents(9, 500)).toBe(0);
      expect(calculateTaxCents(-9, 500)).toBe(0);

      // 333 cents * 21% = 69.93 cents -> rounds to 70 cents
      expect(calculateTaxCents(333, 2100)).toBe(70);
      expect(calculateTaxCents(-333, 2100)).toBe(-70);

      expect(calculateTaxSummaryCents(0, 2100)).toEqual({
        subtotalCents: 0,
        taxCents: 0,
        totalCents: 0,
      });
    });

    it('rejects non-integer subtotals and out-of-range or non-integer taxRateBps', () => {
      expect(() => calculateTaxCents(100.5, 500)).toThrow(RangeError);
      expect(() => calculateTaxCents(10_000, -1)).toThrow(RangeError);
      expect(() => calculateTaxCents(10_000, 10_001)).toThrow(RangeError);
      expect(() => calculateTaxCents(10_000, 5.5)).toThrow(RangeError);
      expect(() =>
        calculateTaxSummaryCents(Number.MAX_SAFE_INTEGER, 500),
      ).toThrow(RangeError);
    });
  });

  describe('percentStringToBps and bpsToPercentString', () => {
    it('parses decimal percentages with dot or comma into exact integer bps without float drift', () => {
      expect(percentStringToBps('0')).toBe(0);
      expect(percentStringToBps('0.00')).toBe(0);
      expect(percentStringToBps('5')).toBe(500);
      expect(percentStringToBps('5.00')).toBe(500);
      expect(percentStringToBps('21')).toBe(2100);
      expect(percentStringToBps('7.5')).toBe(750);
      expect(percentStringToBps('7,5')).toBe(750);
      expect(percentStringToBps('5.25')).toBe(525);
      expect(percentStringToBps('19,99')).toBe(1999);
      expect(percentStringToBps('  8.87 ')).toBe(887);
      expect(percentStringToBps('100')).toBe(10_000);
      expect(percentStringToBps('100.00')).toBe(10_000);
    });

    it('returns null for empty, negative, >100, >2 decimals, or invalid strings', () => {
      expect(percentStringToBps('')).toBeNull();
      expect(percentStringToBps('   ')).toBeNull();
      expect(percentStringToBps('-5')).toBeNull();
      expect(percentStringToBps('+5')).toBeNull();
      expect(percentStringToBps('100.01')).toBeNull();
      expect(percentStringToBps('150')).toBeNull();
      expect(percentStringToBps('99999')).toBeNull();
      expect(percentStringToBps('5.125')).toBeNull();
      expect(percentStringToBps('5.')).toBeNull();
      expect(percentStringToBps('.5')).toBeNull();
      expect(percentStringToBps('5%')).toBeNull();
      expect(percentStringToBps('abc')).toBeNull();
    });

    it('formats bps back to clean percentage strings and validates bounds', () => {
      expect(bpsToPercentString(0)).toBe('0');
      expect(bpsToPercentString(500)).toBe('5');
      expect(bpsToPercentString(505)).toBe('5.05');
      expect(bpsToPercentString(525)).toBe('5.25');
      expect(bpsToPercentString(750)).toBe('7.5');
      expect(bpsToPercentString(2100)).toBe('21');
      expect(bpsToPercentString(10_000)).toBe('100');

      expect(() => bpsToPercentString(-1)).toThrow(RangeError);
      expect(() => bpsToPercentString(10_001)).toThrow(RangeError);
      expect(() => bpsToPercentString(12.3)).toThrow(RangeError);
    });
  });

  describe('CLINIC_SETTINGS_PRESETS and validateClinicSettings', () => {
    it('exposes immutable multi-country presets for UAE, Spain, and USA that pass validation', () => {
      expect(Object.isFrozen(CLINIC_SETTINGS_PRESETS)).toBe(true);
      expect(CLINIC_SETTINGS_PRESETS).toHaveLength(3);

      for (const preset of CLINIC_SETTINGS_PRESETS) {
        expect(Object.isFrozen(preset)).toBe(true);
        const validation = validateClinicSettings({
          name: 'Synthetic Dental Clinic',
          currencyCode: preset.currencyCode,
          currencySymbol: preset.currencySymbol,
          taxRateBps: preset.taxRateBps,
          taxLabel: preset.taxLabel,
          timezone: preset.timezone,
          defaultLocale: preset.defaultLocale,
        });
        expect(validation.valid).toBe(true);
      }
    });

    it('normalizes valid input (trimming strings and uppercasing currencyCode) and freezes result', () => {
      const result = validateClinicSettings({
        name: '  Al Noor Synthetic Clinic  ',
        currencyCode: ' aed ',
        currencySymbol: ' AED ',
        taxRateBps: 500,
        taxLabel: ' VAT ',
        timezone: ' Asia/Dubai ',
        defaultLocale: ' EN ',
      });

      expect(result.valid).toBe(true);
      expect(Object.isFrozen(result)).toBe(true);
      if (result.valid) {
        expect(Object.isFrozen(result.value)).toBe(true);
        expect(result.value).toEqual({
          name: 'Al Noor Synthetic Clinic',
          currencyCode: 'AED',
          currencySymbol: 'AED',
          taxRateBps: 500,
          taxLabel: 'VAT',
          timezone: 'Asia/Dubai',
          defaultLocale: 'en',
        });
      }
    });

    it('returns typed error codes for every invalid or out-of-bounds field', () => {
      const emptyResult = validateClinicSettings({
        name: '   ',
        currencyCode: '',
        currencySymbol: '  ',
        taxRateBps: null,
        taxLabel: '',
        timezone: '',
        defaultLocale: 'fr',
      });

      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.value).toBeNull();
      expect(emptyResult.errors).toEqual({
        name: 'name_required',
        currencyCode: 'currency_code_required',
        currencySymbol: 'currency_symbol_required',
        taxRateBps: 'tax_rate_invalid',
        taxLabel: 'tax_label_required',
        timezone: 'timezone_required',
        defaultLocale: 'default_locale_invalid',
      });

      const boundsResult = validateClinicSettings({
        name: 'A'.repeat(121),
        currencyCode: 'EURO',
        currencySymbol: 'S'.repeat(11),
        taxRateBps: 15_000,
        taxLabel: 'L'.repeat(21),
        timezone: 'T'.repeat(65),
        defaultLocale: 'de',
      });

      expect(boundsResult.valid).toBe(false);
      expect(boundsResult.errors).toEqual({
        name: 'name_too_long',
        currencyCode: 'currency_code_invalid',
        currencySymbol: 'currency_symbol_too_long',
        taxRateBps: 'tax_rate_invalid',
        taxLabel: 'tax_label_too_long',
        timezone: 'timezone_too_long',
        defaultLocale: 'default_locale_invalid',
      });
    });

    it('compares ClinicSettingsInput values accurately via areClinicSettingsEqual', () => {
      const base = {
        name: 'Clinic A',
        currencyCode: 'AED',
        currencySymbol: 'AED',
        taxRateBps: 500,
        taxLabel: 'VAT',
        timezone: 'Asia/Dubai',
        defaultLocale: 'en' as const,
      };

      expect(areClinicSettingsEqual(base, { ...base })).toBe(true);
      expect(
        areClinicSettingsEqual(base, { ...base, taxRateBps: 2100 }),
      ).toBe(false);
    });
  });
});
