"use client";

import { Suspense } from "react";
import { ThemeProvider } from "@/lib/theme";
import { LocaleProvider } from "@/lib/i18n";
import { DocumentLangSync } from "@/components/i18n/document-lang-sync";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <Suspense fallback={null}>
          <DocumentLangSync />
        </Suspense>
        {children}
      </LocaleProvider>
    </ThemeProvider>
  );
}
