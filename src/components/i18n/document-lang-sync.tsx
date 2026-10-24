"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n";

function documentLangForLocale(locale: string) {
  return locale === "en" ? "en" : "zh-CN";
}

export function DocumentLangSync() {
  const { locale } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlLocale = searchParams.get("lang") === "en" ? "en" : searchParams.get("lang") === "zh" ? "zh" : null;
  const effectiveLocale = urlLocale ?? (pathname === "/" ? "en" : locale);

  useEffect(() => {
    document.documentElement.lang = documentLangForLocale(effectiveLocale);
  }, [effectiveLocale, pathname]);

  return null;
}
