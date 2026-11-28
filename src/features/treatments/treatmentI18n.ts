import type { TreatmentCategory } from '@/domain/treatments';
import type { TranslationKey } from '@/i18n';

const CATEGORY_LABEL_KEYS: Readonly<Record<TreatmentCategory, TranslationKey>> =
  Object.freeze({
    preventive: 'treatments.categories.preventive',
    restorative: 'treatments.categories.restorative',
    endodontics: 'treatments.categories.endodontics',
    periodontics: 'treatments.categories.periodontics',
    orthodontics: 'treatments.categories.orthodontics',
    surgery: 'treatments.categories.surgery',
    prosthetics: 'treatments.categories.prosthetics',
    diagnostics: 'treatments.categories.diagnostics',
    aesthetics: 'treatments.categories.aesthetics',
    other: 'treatments.categories.other',
  });

export function getTreatmentCategoryLabelKey(
  category: TreatmentCategory,
): TranslationKey {
  return CATEGORY_LABEL_KEYS[category];
}
