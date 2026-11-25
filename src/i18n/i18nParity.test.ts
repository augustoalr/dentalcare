import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';

function collectLeafEntries(
  node: Record<string, unknown>,
  prefix = '',
): Array<{ key: string; value: unknown }> {
  const entries: Array<{ key: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(node)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push(...collectLeafEntries(value as Record<string, unknown>, fullKey));
    } else {
      entries.push({ key: fullKey, value });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

describe('i18n locale parity', () => {
  it('has identical keys in English and Spanish dictionaries', () => {
    const enEntries = collectLeafEntries(en);
    const esEntries = collectLeafEntries(es);

    const enKeys = enEntries.map((entry) => entry.key);
    const esKeys = esEntries.map((entry) => entry.key);

    expect(esKeys).toEqual(enKeys);
  });

  it('has no empty translation strings in either locale', () => {
    for (const entry of collectLeafEntries(en)) {
      expect(typeof entry.value).toBe('string');
      expect((entry.value as string).trim().length).toBeGreaterThan(0);
    }

    for (const entry of collectLeafEntries(es)) {
      expect(typeof entry.value).toBe('string');
      expect((entry.value as string).trim().length).toBeGreaterThan(0);
    }
  });
});
