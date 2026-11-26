import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LOCALE_STORAGE_KEY,
  resolveInitialLocale,
  type SupportedLocale,
} from '@/domain/locale';
import {
  BrowserStorageAdapter,
  type IStorageAdapter,
} from '@/services/storage/storageAdapter';
import en from './locales/en.json';
import es from './locales/es.json';

type TranslationDictionary = typeof en;

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? Join<Key, NestedKeyOf<ObjectType[Key]>>
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationDictionary>;

export type LocaleChangeListener = (nextLocale: SupportedLocale) => void;

const DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = {
  en,
  es,
};

function lookupTranslation(
  dictionary: TranslationDictionary,
  key: TranslationKey,
): string {
  const segments = key.split('.');
  let current: unknown = dictionary;

  for (const segment of segments) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !(segment in current)
    ) {
      return key;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : key;
}

export interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (nextLocale: SupportedLocale) => void;
  syncLocale: (nextLocale: SupportedLocale) => void;
  subscribeLocaleChange: (listener: LocaleChangeListener) => () => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  storage?: IStorageAdapter;
  initialLocale?: SupportedLocale;
}

export function I18nProvider({
  children,
  storage,
  initialLocale,
}: I18nProviderProps) {
  const storageAdapter = useMemo(
    () => storage ?? new BrowserStorageAdapter(),
    [storage],
  );

  const listenersRef = useRef(new Set<LocaleChangeListener>());

  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (initialLocale) {
      return initialLocale;
    }
    const persisted = storageAdapter.getItem(LOCALE_STORAGE_KEY);
    const browserLang =
      typeof navigator !== 'undefined' ? navigator.language : undefined;
    return resolveInitialLocale(persisted, browserLang);
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const syncLocale = useCallback(
    (nextLocale: SupportedLocale) => {
      setLocaleState(nextLocale);
      storageAdapter.setItem(LOCALE_STORAGE_KEY, nextLocale);
    },
    [storageAdapter],
  );

  const setLocale = useCallback(
    (nextLocale: SupportedLocale) => {
      setLocaleState(nextLocale);
      storageAdapter.setItem(LOCALE_STORAGE_KEY, nextLocale);
      for (const listener of listenersRef.current) {
        listener(nextLocale);
      }
    },
    [storageAdapter],
  );

  const subscribeLocaleChange = useCallback((listener: LocaleChangeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => lookupTranslation(DICTIONARIES[locale], key),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      syncLocale,
      subscribeLocaleChange,
      t,
    }),
    [locale, setLocale, syncLocale, subscribeLocaleChange, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
