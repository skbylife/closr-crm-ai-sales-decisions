"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface PageBackButtonProps {
  fallbackHref: string;
  label?: string;
  className?: string;
}

export function PageBackButton({
  fallbackHref,
  label = "返回",
  className = "inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-secondary shadow-sm transition-all hover:bg-background hover:text-foreground hover:shadow-md",
}: PageBackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className={className}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
