"use client";

import { Radio } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import IntelCenter from "@/components/intel/intel-center";

export default function IntelPage() {
  const { t } = useLocale();

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:overflow-hidden">
      {/* Page Header */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Radio className="h-5 w-5 text-accent" />
          {t("nav.intel")}
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          {t("intel.entryHint")}
        </p>
      </div>

      <IntelCenter />
    </div>
  );
}
