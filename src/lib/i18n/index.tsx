"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useStore } from '@/lib/store';
import { navDict } from './dictionaries/nav';
import { dashboardDict } from './dictionaries/dashboard';
import { crmDict } from './dictionaries/crm';
import { intelligenceDict } from './dictionaries/intelligence';
import { tasksDict } from './dictionaries/tasks';
import { settingsDict } from './dictionaries/settings';
import { landingDict } from './dictionaries/landing';
import { commonDict } from './dictionaries/common';
import { currencyForLocale } from '@/lib/format-currency';

export type Locale = "zh" | "en";

// ─── Translation Dictionary ─────────────────────────────────────────
// Entries live in ./dictionaries/*, grouped by surface area.
// Keys must stay globally unique across all namespace files.

const dict = {
  ...navDict,
  ...dashboardDict,
  ...crmDict,
  ...intelligenceDict,
  ...tasksDict,
  ...settingsDict,
  ...landingDict,
  ...commonDict,
} as const;

export type TranslationKey = keyof typeof dict;

// ─── Context ─────────────────────────────────────────────────────────

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "zh",
  setLocale: () => {},
  t: (key) => key,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem("closr-locale") as Locale | null;
      if (stored === 'zh' || stored === 'en') return stored;
    }
    const storeLocale = useStore.getState().userSettings?.locale;
    if (storeLocale === 'zh' || storeLocale === 'en') return storeLocale;
    return 'zh';
  });

  useEffect(() => {
    const unsub = useStore.subscribe((state: { userSettings: { locale: Locale } }) => {
      const l = state.userSettings?.locale;
      const stored = typeof window !== 'undefined'
        ? localStorage.getItem("closr-locale") as Locale | null
        : null;
      if (stored === 'zh' || stored === 'en') {
        setLocaleState(stored);
        return;
      }
      if (l === 'zh' || l === 'en') setLocaleState(l);
    });
    return unsub;
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') localStorage.setItem("closr-locale", l);
    useStore.getState().setUserSettings({ locale: l, currencyCode: currencyForLocale(l) });
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = dict[key];
      if (!entry) return key;
      return entry[locale] || entry.zh;
    },
    [locale]
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
