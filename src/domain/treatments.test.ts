import { describe, expect, it } from 'vitest';
import { MAX_MONEY_AMOUNT_CENTS } from '@/domain/money';
import {
  filterTreatments,
  getLocalizedTreatmentName,
  getSecondaryTreatmentName,
  isTreatmentCategory,
  parseDurationMinutesString,
  TREATMENT_CATEGORIES,
  TREATMENT_CODE_MAX_LENGTH,
  TREATMENT_DEFAULT_DURATION_MIN,
  TREATMENT_MAX_DURATION_MIN,
  TREATMENT_MIN_DURATION_MIN,
  TREATMENT_NAME_MAX_LENGTH,
  validateTreatmentInput,
  type TreatmentRecord,
} from './treatments';

const SAMPLE_TREATMENTS: readonly TreatmentRecord[] = Object.freeze([
  Object.freeze({
    id: 'tr-1',
    clinicId: 'clinic-1',
    code: 'CLEAN-01',
    nameEn: 'Dental Prophylaxis',
    nameEs: 'Limpieza Dental Profunda',
    category: 'preventive',
    defaultPriceCents: 15_050,
    defaultDurationMin: 45,
    isActive: true,
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:00:00Z',
  }),
  Object.freeze({
    id: 'tr-2',
    clinicId: 'clinic-1',
    code: 'ENDO-MOLAR',
    nameEn: 'Molar Root Canal',
    nameEs: 'Endodoncia Molar',
    category: 'endodontics',
    defaultPriceCents: 65_000,
    defaultDurationMin: 90,
    isActive: true,
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:00:00Z',
  }),
  Object.freeze({
    id: 'tr-3',
    clinicId: 'clinic-1',
    code: 'AESTH-01',
    nameEn: 'In-Office Teeth Whitening',
    nameEs: 'Blanqueamiento Estético',
    category: 'aesthetics',
    defaultPriceCents: 42_000,
    defaultDurationMin: 60,
    isActive: false,
    createdAt: '2026-11-27T08:00:00Z',
    updatedAt: '2026-11-27T08:00:00Z',
  }),
]);

describe('T-07 Pure treatments catalog domain', () => {
  it('exposes SQL-aligned constants, frozen categories, and runtime type guard', () => {
    expect(TREATMENT_CODE_MAX_LENGTH).toBe(32);
    expect(TREATMENT_NAME_MAX_LENGTH).toBe(120);
    expect(TREATMENT_MIN_DURATION_MIN).toBe(5);
    expect(TREATMENT_MAX_DURATION_MIN).toBe(480);
    expect(TREATMENT_DEFAULT_DURATION_MIN).toBe(30);
    expect(Object.isFrozen(TREATMENT_CATEGORIES)).toBe(true);
    expect(TREATMENT_CATEGORIES).toHaveLength(10);

    for (const category of TREATMENT_CATEGORIES) {
      expect(isTreatmentCategory(category)).toBe(true);
    }
    expect(isTreatmentCategory('cosmetic')).toBe(false);
    expect(isTreatmentCategory('')).toBe(false);
  });

  it('parses duration strings cleanly into integers', () => {
    expect(parseDurationMinutesString('30')).toBe(30);
    expect(parseDurationMinutesString(' 0045 ')).toBe(45);
    expect(parseDurationMinutesString('480')).toBe(480);
    expect(parseDurationMinutesString('')).toBeNull();
    expect(parseDurationMinutesString('   ')).toBeNull();
    expect(parseDurationMinutesString('30.5')).toBeNull();
    expect(parseDurationMinutesString('-15')).toBeNull();
    expect(parseDurationMinutesString('30m')).toBeNull();
    expect(parseDurationMinutesString('9999999')).toBeNull();
  });

  it('returns localized and secondary treatment names for EN and ES', () => {
    const sample = SAMPLE_TREATMENTS[0]!;
    expect(getLocalizedTreatmentName(sample, 'en')).toBe('Dental Prophylaxis');
    expect(getLocalizedTreatmentName(sample, 'es')).toBe(
      'Limpieza Dental Profunda',
    );
    expect(getSecondaryTreatmentName(sample, 'en')).toBe(
      'Limpieza Dental Profunda',
    );
    expect(getSecondaryTreatmentName(sample, 'es')).toBe('Dental Prophylaxis');
  });

  it('validates and normalizes valid treatment input (uppercasing code and freezing output)', () => {
    const result = validateTreatmentInput({
      code: '  clean_01-a ',
      nameEn: '  Dental Prophylaxis  ',
      nameEs: '  Limpieza dental  ',
      category: ' PREVENTIVE ',
      defaultPriceCents: 15_050,
      defaultDurationMin: 45,
      isActive: true,
    });

    expect(result.valid).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    if (result.valid) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value).toEqual({
        code: 'CLEAN_01-A',
        nameEn: 'Dental Prophylaxis',
        nameEs: 'Limpieza dental',
        category: 'preventive',
        defaultPriceCents: 15_050,
        defaultDurationMin: 45,
        isActive: true,
      });
    }

    // Boundary values: 0 cents, max cents, 5 min, 480 min, inactive
    const boundary = validateTreatmentInput({
      code: 'A',
      nameEn: 'X'.repeat(120),
      nameEs: 'Y'.repeat(120),
      category: 'other',
      defaultPriceCents: MAX_MONEY_AMOUNT_CENTS,
      defaultDurationMin: 480,
      isActive: false,
    });
    expect(boundary.valid).toBe(true);
  });

  it('returns typed field error codes for every invalid or out-of-bounds field', () => {
    const emptyResult = validateTreatmentInput({
      code: '   ',
      nameEn: '',
      nameEs: '  ',
      category: 'unknown',
      defaultPriceCents: null,
      defaultDurationMin: null,
      isActive: true,
    });

    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.value).toBeNull();
    expect(emptyResult.errors).toEqual({
      code: 'code_required',
      nameEn: 'name_required',
      nameEs: 'name_required',
      category: 'category_invalid',
      defaultPriceCents: 'price_invalid',
      defaultDurationMin: 'duration_invalid',
      isActive: null,
    });

    const invalidFormat = validateTreatmentInput({
      code: '-BAD CODE',
      nameEn: 'A'.repeat(121),
      nameEs: 'B'.repeat(121),
      category: 'surgery',
      defaultPriceCents: -1,
      defaultDurationMin: 4,
      isActive: false,
    });
    expect(invalidFormat.valid).toBe(false);
    expect(invalidFormat.errors).toEqual({
      code: 'code_invalid',
      nameEn: 'name_too_long',
      nameEs: 'name_too_long',
      category: null,
      defaultPriceCents: 'price_invalid',
      defaultDurationMin: 'duration_invalid',
      isActive: null,
    });

    const overMax = validateTreatmentInput({
      code: 'C'.repeat(33),
      nameEn: 'Valid',
      nameEs: 'Válido',
      category: 'diagnostics',
      defaultPriceCents: MAX_MONEY_AMOUNT_CENTS + 1,
      defaultDurationMin: 481,
      isActive: true,
    });
    expect(overMax.valid).toBe(false);
    expect(overMax.errors).toEqual({
      code: 'code_too_long',
      nameEn: null,
      nameEs: null,
      category: null,
      defaultPriceCents: 'price_invalid',
      defaultDurationMin: 'duration_invalid',
      isActive: null,
    });
  });

  it('filters immutably by accent-insensitive query (code, nameEn, nameEs), category, and includeInactive', () => {
    const originalSnapshot = [...SAMPLE_TREATMENTS];

    // Accent-insensitive Spanish name match
    const aestheticMatches = filterTreatments(SAMPLE_TREATMENTS, {
      query: 'estetico',
      category: 'all',
      includeInactive: true,
    });
    expect(Object.isFrozen(aestheticMatches)).toBe(true);
    expect(aestheticMatches.map((item) => item.id)).toEqual(['tr-3']);

    // Hidden when includeInactive is false
    const activeOnlyAesthetic = filterTreatments(SAMPLE_TREATMENTS, {
      query: 'estetico',
      category: 'all',
      includeInactive: false,
    });
    expect(activeOnlyAesthetic).toHaveLength(0);

    // Code search (lowercase query matches uppercase code)
    const codeMatches = filterTreatments(SAMPLE_TREATMENTS, {
      query: 'endo-molar',
      category: 'all',
      includeInactive: true,
    });
    expect(codeMatches.map((item) => item.id)).toEqual(['tr-2']);

    // English name search + category filter
    const englishMatches = filterTreatments(SAMPLE_TREATMENTS, {
      query: 'prophylaxis',
      category: 'preventive',
      includeInactive: false,
    });
    expect(englishMatches.map((item) => item.id)).toEqual(['tr-1']);

    // Mismatched category returns empty
    expect(
      filterTreatments(SAMPLE_TREATMENTS, {
        query: 'prophylaxis',
        category: 'surgery',
        includeInactive: true,
      }),
    ).toHaveLength(0);

    // Original array untouched
    expect(SAMPLE_TREATMENTS).toEqual(originalSnapshot);
  });
});
